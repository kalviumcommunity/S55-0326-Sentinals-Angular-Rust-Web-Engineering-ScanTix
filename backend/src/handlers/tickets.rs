use axum::{
    extract::{Path, State},
    Extension, Json,
};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::event::Event;
use crate::models::order::Order;
use crate::models::seat::EventSeat;
use crate::models::ticket::{PurchaseRequest, Ticket, TicketWithQr};
use crate::utils::jwt::Claims;
use crate::utils::qr;
use crate::AppState;

/// POST /api/tickets/purchase — buy tickets for an event
pub async fn purchase_tickets(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(input): Json<PurchaseRequest>,
) -> Result<Json<Vec<Ticket>>, AppError> {
    // Fetch event
    let event = sqlx::query_as::<_, Event>("SELECT * FROM events WHERE id = $1")
        .bind(input.event_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Event not found".to_string()))?;

    if event.status != "published" {
        return Err(AppError::BadRequest("Event is not available for purchase".to_string()));
    }

    // ── Seat-map path ──────────────────────────────────────────────────────────
    if event.seat_map_enabled {
        let seat_ids = input
            .seat_ids
            .as_ref()
            .filter(|v| !v.is_empty())
            .ok_or_else(|| AppError::BadRequest("seat_ids are required for seat-map events".to_string()))?;

        let quantity = seat_ids.len() as i32;

        if quantity <= 0 || quantity > 10 {
            return Err(AppError::BadRequest("You can purchase between 1 and 10 seats at once".to_string()));
        }

        // Fraud: max 10 seats per user per event
        let existing_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM tickets WHERE event_id = $1 AND user_id = $2 AND status = 'valid'"
        )
        .bind(input.event_id)
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?;

        if existing_count + quantity as i64 > 10 {
            return Err(AppError::BadRequest(
                format!("Maximum 10 tickets per user. You already have {}", existing_count)
            ));
        }

        let total = event.ticket_price * rust_decimal::Decimal::from(quantity);

        // Use a transaction for atomicity
        let mut tx = state.db.begin().await?;

        // Create order
        let order = sqlx::query_as::<_, Order>(
            "INSERT INTO orders (user_id, event_id, total_amount, quantity) VALUES ($1, $2, $3, $4) RETURNING *"
        )
        .bind(claims.sub)
        .bind(input.event_id)
        .bind(total)
        .bind(quantity)
        .fetch_one(&mut *tx)
        .await?;

        let mut tickets = Vec::new();

        for seat_id in seat_ids {
            // Verify each seat is still locked by this user (atomic claim)
            let seat = sqlx::query_as::<_, EventSeat>(
                r#"UPDATE event_seats
                   SET status = 'booked',
                       locked_by = NULL,
                       locked_until = NULL
                   WHERE id = $1
                     AND event_id = $2
                     AND status = 'locked'
                     AND locked_by = $3
                   RETURNING *"#
            )
            .bind(*seat_id)
            .bind(input.event_id)
            .bind(claims.sub)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| AppError::Conflict(
                format!("Seat {} is no longer locked by you. Please re-select.", seat_id)
            ))?;

            let ticket_id = Uuid::new_v4();
            let qr_data = qr::generate_qr_payload(ticket_id, input.event_id, claims.sub, &state.config.jwt_secret);

            let ticket = sqlx::query_as::<_, Ticket>(
                r#"INSERT INTO tickets (id, order_id, event_id, seat_id, user_id, qr_code_data)
                   VALUES ($1, $2, $3, $4, $5, $6) RETURNING *"#
            )
            .bind(ticket_id)
            .bind(order.id)
            .bind(input.event_id)
            .bind(seat.id)
            .bind(claims.sub)
            .bind(&qr_data)
            .fetch_one(&mut *tx)
            .await?;

            tickets.push(ticket);
        }

        // Update tickets_sold
        sqlx::query("UPDATE events SET tickets_sold = tickets_sold + $1 WHERE id = $2")
            .bind(quantity)
            .bind(input.event_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        return Ok(Json(tickets));
    }

    // ── Standard (no seat-map) path ────────────────────────────────────────────
    let quantity = input.quantity;
    if quantity <= 0 || quantity > 10 {
        return Err(AppError::BadRequest("Quantity must be between 1 and 10".to_string()));
    }

    // Check availability
    let remaining = event.max_tickets - event.tickets_sold;
    if quantity > remaining {
        return Err(AppError::BadRequest(format!("Only {} tickets remaining", remaining)));
    }

    // Fraud check
    let existing_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM tickets WHERE event_id = $1 AND user_id = $2 AND status = 'valid'"
    )
    .bind(input.event_id)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    if existing_count + quantity as i64 > 10 {
        return Err(AppError::BadRequest(
            format!("Maximum 10 tickets per user. You already have {}", existing_count)
        ));
    }

    let total = event.ticket_price * rust_decimal::Decimal::from(quantity);

    let order = sqlx::query_as::<_, Order>(
        "INSERT INTO orders (user_id, event_id, total_amount, quantity) VALUES ($1, $2, $3, $4) RETURNING *"
    )
    .bind(claims.sub)
    .bind(input.event_id)
    .bind(total)
    .bind(quantity)
    .fetch_one(&state.db)
    .await?;

    let mut tickets = Vec::new();
    for _ in 0..quantity {
        let ticket_id = Uuid::new_v4();
        let qr_data = qr::generate_qr_payload(ticket_id, input.event_id, claims.sub, &state.config.jwt_secret);

        let ticket = sqlx::query_as::<_, Ticket>(
            r#"INSERT INTO tickets (id, order_id, event_id, user_id, qr_code_data)
               VALUES ($1, $2, $3, $4, $5) RETURNING *"#
        )
        .bind(ticket_id)
        .bind(order.id)
        .bind(input.event_id)
        .bind(claims.sub)
        .bind(&qr_data)
        .fetch_one(&state.db)
        .await?;

        tickets.push(ticket);
    }

    sqlx::query("UPDATE events SET tickets_sold = tickets_sold + $1 WHERE id = $2")
        .bind(quantity)
        .bind(input.event_id)
        .execute(&state.db)
        .await?;

    Ok(Json(tickets))
}

/// GET /api/tickets/my — list user's tickets
pub async fn my_tickets(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<Ticket>>, AppError> {
    let tickets = sqlx::query_as::<_, Ticket>(
        "SELECT * FROM tickets WHERE user_id = $1 ORDER BY created_at DESC"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(tickets))
}

/// GET /api/tickets/:id/qr — get ticket with QR code image
pub async fn get_ticket_qr(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<TicketWithQr>, AppError> {
    let ticket = sqlx::query_as::<_, Ticket>(
        "SELECT * FROM tickets WHERE id = $1 AND user_id = $2"
    )
    .bind(id)
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Ticket not found".to_string()))?;

    let qr_image = qr::generate_qr_image_base64(&ticket.qr_code_data)
        .map_err(|e| AppError::Internal(e))?;

    Ok(Json(TicketWithQr {
        ticket,
        qr_image_base64: qr_image,
    }))
}
