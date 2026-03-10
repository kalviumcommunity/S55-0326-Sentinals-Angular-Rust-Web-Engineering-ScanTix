use axum::{
    extract::{Path, State},
    Extension, Json,
};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::event::Event;
use crate::models::staff::{AssignStaffRequest, EventStaff, ValidateTicketRequest, ValidateTicketResponse};
use crate::models::ticket::Ticket;
use crate::models::user::User;
use crate::utils::jwt::Claims;
use crate::utils::qr;
use crate::AppState;

/// POST /api/events/:id/staff/assign — organizer assigns a staff member
pub async fn assign_staff(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(event_id): Path<Uuid>,
    Json(input): Json<AssignStaffRequest>,
) -> Result<Json<EventStaff>, AppError> {
    // Verify event ownership
    let event = sqlx::query_as::<_, Event>("SELECT * FROM events WHERE id = $1")
        .bind(event_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Event not found".to_string()))?;

    if event.organizer_id != claims.sub && claims.role != "admin" {
        return Err(AppError::Forbidden("Only the organizer can assign staff".to_string()));
    }

    // Find user by email
    let staff_user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
        .bind(&input.email)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("User with this email not found".to_string()))?;

    // Create assignments
    let assignment = sqlx::query_as::<_, EventStaff>(
        "INSERT INTO event_staff (event_id, staff_id, assigned_by) VALUES ($1, $2, $3) RETURNING *"
    )
    .bind(event_id)
    .bind(staff_user.id)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        if e.to_string().contains("event_staff_unique") {
            AppError::Conflict("Staff member is already assigned to this event".to_string())
        } else {
            AppError::Internal("Database error".to_string())
        }
    })?;

    // Upgrade role to staff if they are just a user
    if staff_user.role == "user" {
        sqlx::query("UPDATE users SET role = 'staff' WHERE id = $1")
            .bind(staff_user.id)
            .execute(&state.db)
            .await?;
    }

    Ok(Json(assignment))
}

/// GET /api/staff/events — Staff member retrieves events they are assigned to
pub async fn get_assigned_events(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> Result<Json<Vec<Event>>, AppError> {
    let events = sqlx::query_as::<_, Event>(
        r#"SELECT e.* FROM events e 
           JOIN event_staff es ON e.id = es.event_id 
           WHERE es.staff_id = $1 
           ORDER BY e.event_date ASC"#
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(events))
}

/// POST /api/tickets/validate — Staff validates a scanned QR code
pub async fn validate_ticket(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(input): Json<ValidateTicketRequest>,
) -> Result<Json<ValidateTicketResponse>, AppError> {
    
    // Verify auth: User must be staff or organizer for this event
    let event = sqlx::query_as::<_, Event>("SELECT * FROM events WHERE id = $1")
        .bind(input.event_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Event not found".to_string()))?;
        
    let is_organizer = event.organizer_id == claims.sub || claims.role == "admin";
    let is_staff = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM event_staff WHERE event_id = $1 AND staff_id = $2)"
    )
    .bind(input.event_id)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    if !is_organizer && !is_staff {
        return Err(AppError::Forbidden("You are not authorized to validate tickets for this event".to_string()));
    }

    // Attempt to verify QR data
    let ticket_id = match qr::verify_qr_payload(&input.qr_data, &state.config.jwt_secret) {
        Some((t_id, _, _)) => t_id,
        None => {
            return Ok(Json(ValidateTicketResponse {
                status: "INVALID_TICKET".to_string(),
                message: "Failed to verify QR code signature. Invalid or forged ticket.".to_string(),
                ticket_id: None,
            }));
        }
    };

    // Use transaction to ensure atomic check-and-update
    let mut tx = state.db.begin().await?;

    // Lock the row FOR UPDATE to prevent race conditions (double entry from two scanners)
    let ticket = sqlx::query_as::<_, Ticket>(
        "SELECT * FROM tickets WHERE id = $1 AND event_id = $2 FOR UPDATE"
    )
    .bind(ticket_id)
    .bind(input.event_id)
    .fetch_optional(&mut *tx)
    .await?;

    let ticket = match ticket {
        Some(t) => t,
        None => {
            return Ok(Json(ValidateTicketResponse {
                status: "INVALID_TICKET".to_string(),
                message: "Ticket not found for this specific event.".to_string(),
                ticket_id: Some(ticket_id),
            }));
        }
    };

    if ticket.status == "used" || ticket.scanned_at.is_some() {
        return Ok(Json(ValidateTicketResponse {
            status: "TICKET_ALREADY_USED".to_string(),
            message: format!("Ticket was already scanned!"),
            ticket_id: Some(ticket_id),
        }));
    }

    if ticket.status != "valid" {
        return Ok(Json(ValidateTicketResponse {
            status: "INVALID_TICKET".to_string(),
            message: format!("Ticket is {}", ticket.status), // cancelled, etc.
            ticket_id: Some(ticket_id),
        }));
    }

    // Mark as used
    sqlx::query("UPDATE tickets SET status = 'used', scanned_at = NOW() WHERE id = $1")
        .bind(ticket_id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    Ok(Json(ValidateTicketResponse {
        status: "VALID_TICKET".to_string(),
        message: "Ticket is valid. Entry granted.".to_string(),
        ticket_id: Some(ticket_id),
    }))
}
