use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct EventStaff {
    pub id: Uuid,
    pub event_id: Uuid,
    pub staff_id: Uuid,
    pub assigned_by: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct AssignStaffRequest {
    pub email: String,
}

#[derive(Debug, Serialize)]
pub struct ValidateTicketResponse {
    pub status: String, // VALID_TICKET, INVALID_TICKET, TICKET_ALREADY_USED
    pub message: String,
    pub ticket_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct ValidateTicketRequest {
    // The raw QR code data scanned by the device
    pub qr_data: String,
    pub event_id: Uuid,
}
