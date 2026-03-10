use axum::{
    extract::{Path, State},
    Extension, Json,
};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::event::{CreateEvent, Event, EventStats, UpdateEvent};
use crate::utils::jwt::Claims;
use crate::AppState;

/// GET /api/events — list all non-cancelled events
pub async fn list_events(
    State(state): State<AppState>,
) -> Result<Json<Vec<Event>>, AppError> {
    let events = sqlx::query_as::<_, Event>(
        "SELECT * FROM events WHERE status != 'cancelled' ORDER BY event_date ASC"
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(events))
}

/// GET /api/events/:id — get single event
pub async fn get_event(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Event>, AppError> {
    let event = sqlx::query_as::<_, Event>("SELECT * FROM events WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Event not found".to_string()))?;

    Ok(Json(event))
}

/// GET /api/events/my — list events created by the authenticated organizer
pub async fn my_events(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<Event>>, AppError> {
    let events = sqlx::query_as::<_, Event>(
        "SELECT * FROM events WHERE organizer_id = $1 ORDER BY created_at DESC"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(events))
}

/// GET /api/events/:id/stats — event analytics (organizer only)
pub async fn get_event_stats(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<EventStats>, AppError> {
    let event = sqlx::query_as::<_, Event>("SELECT * FROM events WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Event not found".to_string()))?;

    let remaining = event.max_tickets - event.tickets_sold;
    let revenue = event.ticket_price * rust_decimal::Decimal::from(event.tickets_sold);
    let occupancy_pct = if event.max_tickets > 0 {
        (event.tickets_sold as f64 / event.max_tickets as f64) * 100.0
    } else {
        0.0
    };

    Ok(Json(EventStats {
        event_id: event.id,
        title: event.title,
        tickets_sold: event.tickets_sold,
        max_tickets: event.max_tickets,
        remaining,
        revenue,
        occupancy_pct,
    }))
}

/// POST /api/events — create new event (organizer)
pub async fn create_event(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(input): Json<CreateEvent>,
) -> Result<Json<Event>, AppError> {
    if input.title.is_empty() {
        return Err(AppError::BadRequest("Title is required".to_string()));
    }
    if input.max_tickets <= 0 {
        return Err(AppError::BadRequest("max_tickets must be positive".to_string()));
    }

    let seat_map_enabled = input.seat_map_enabled.unwrap_or(false);
    if seat_map_enabled {
        let rows = input.seat_rows.unwrap_or(0);
        let cols = input.seat_columns.unwrap_or(0);
        if rows <= 0 || rows > 26 {
            return Err(AppError::BadRequest("seat_rows must be between 1 and 26".to_string()));
        }
        if cols <= 0 || cols > 100 {
            return Err(AppError::BadRequest("seat_columns must be between 1 and 100".to_string()));
        }
    }

    let event = sqlx::query_as::<_, Event>(
        r#"INSERT INTO events (title, description, location, venue_id, organizer_id, event_date,
                               ticket_price, vip_price, max_tickets, status,
                               seat_map_enabled, seat_rows, seat_columns)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'published', $10, $11, $12)
           RETURNING *"#,
    )
    .bind(&input.title)
    .bind(&input.description)
    .bind(&input.location)
    .bind(input.venue_id)
    .bind(claims.sub)
    .bind(input.event_date)
    .bind(input.ticket_price)
    .bind(input.vip_price)
    .bind(input.max_tickets)
    .bind(seat_map_enabled)
    .bind(input.seat_rows)
    .bind(input.seat_columns)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(event))
}

/// PUT /api/events/:id — update event
pub async fn update_event(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(input): Json<UpdateEvent>,
) -> Result<Json<Event>, AppError> {
    let existing = sqlx::query_as::<_, Event>("SELECT * FROM events WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Event not found".to_string()))?;

    if existing.organizer_id != claims.sub && claims.role != "admin" {
        return Err(AppError::Forbidden("Not authorized to update this event".to_string()));
    }

    let event = sqlx::query_as::<_, Event>(
        r#"UPDATE events SET
            title = COALESCE($1, title),
            description = COALESCE($2, description),
            location = COALESCE($3, location),
            event_date = COALESCE($4, event_date),
            ticket_price = COALESCE($5, ticket_price),
            vip_price = COALESCE($6, vip_price),
            max_tickets = COALESCE($7, max_tickets),
            status = COALESCE($8, status),
            seat_map_enabled = COALESCE($10, seat_map_enabled),
            seat_rows = COALESCE($11, seat_rows),
            seat_columns = COALESCE($12, seat_columns),
            updated_at = NOW()
           WHERE id = $9 RETURNING *"#
    )
    .bind(input.title)
    .bind(input.description)
    .bind(input.location)
    .bind(input.event_date)
    .bind(input.ticket_price)
    .bind(input.vip_price)
    .bind(input.max_tickets)
    .bind(input.status)
    .bind(id)
    .bind(input.seat_map_enabled)
    .bind(input.seat_rows)
    .bind(input.seat_columns)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(event))
}

/// DELETE /api/events/:id — cancel event
pub async fn delete_event(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>, AppError> {
    let existing = sqlx::query_as::<_, Event>("SELECT * FROM events WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Event not found".to_string()))?;

    if existing.organizer_id != claims.sub && claims.role != "admin" {
        return Err(AppError::Forbidden("Not authorized to delete this event".to_string()));
    }

    sqlx::query("UPDATE events SET status = 'cancelled' WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    Ok(Json(serde_json::json!({ "message": "Event cancelled successfully" })))
}
