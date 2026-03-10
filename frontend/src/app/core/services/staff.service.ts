import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ScanEvent } from './event.service';

export interface AssignStaffRequest {
    email: String;
}

export interface EventStaff {
    id: string;
    event_id: string;
    staff_id: string;
    assigned_by: string;
    created_at: string;
}

export interface ValidateTicketRequest {
    qr_data: string;
    event_id: string;
}

export interface ValidateTicketResponse {
    status: 'VALID_TICKET' | 'INVALID_TICKET' | 'TICKET_ALREADY_USED';
    message: string;
    ticket_id?: string;
}

@Injectable({
    providedIn: 'root'
})
export class StaffService {
    private apiUrl = `${environment.apiUrl}`;

    constructor(private http: HttpClient) { }

    assignStaff(eventId: string, email: string): Observable<EventStaff> {
        return this.http.post<EventStaff>(`${this.apiUrl}/events/${eventId}/staff/assign`, { email });
    }

    getAssignedEvents(): Observable<ScanEvent[]> {
        return this.http.get<ScanEvent[]>(`${this.apiUrl}/staff/events`);
    }

    validateTicket(payload: ValidateTicketRequest): Observable<ValidateTicketResponse> {
        return this.http.post<ValidateTicketResponse>(`${this.apiUrl}/staff/validate`, payload);
    }
}
