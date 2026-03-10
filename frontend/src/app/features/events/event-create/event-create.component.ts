import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { EventService, CreateEventPayload } from '../../../core/services/event.service';
import { SeatService } from '../../../core/services/seat.service';

@Component({
  selector: 'app-event-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-container animate-fadeIn">
      <div class="page-header">
        <h1>➕ <span class="gradient-text">Create Event</span></h1>
        <p>Set up your event details and start selling tickets</p>
      </div>

      <div class="glass-card" style="padding:40px;max-width:760px">
        @if (error) { <div class="alert alert-danger">{{ error }}</div> }

        <form (ngSubmit)="onSubmit()">
          <div class="form-group">
            <label>Event Title *</label>
            <input class="form-control" [(ngModel)]="title" name="title" placeholder="My Amazing Event" required>
          </div>

          <div class="form-group">
            <label>Description</label>
            <textarea class="form-control" [(ngModel)]="description" name="description"
                      placeholder="Tell people what your event is about..." rows="4"></textarea>
          </div>

          <div class="form-group">
            <label>📍 Location</label>
            <input class="form-control" [(ngModel)]="location" name="location"
                   placeholder="e.g. Madison Square Garden, New York">
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            <div class="form-group">
              <label>Event Date & Time *</label>
              <input type="datetime-local" class="form-control" [(ngModel)]="eventDate" name="event_date" required>
            </div>
            <div class="form-group">
              <label>Max Tickets *</label>
              <input type="number" class="form-control" [(ngModel)]="maxTickets" name="max_tickets"
                     placeholder="500" min="1" [disabled]="seatMapEnabled" required>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            <div class="form-group">
              <label>Ticket Price (USD) *</label>
              <input type="number" class="form-control" step="0.01" [(ngModel)]="ticketPrice"
                     name="ticket_price" placeholder="25.00" min="0" required>
            </div>
            <div class="form-group">
              <label>VIP Price (USD)</label>
              <input type="number" class="form-control" step="0.01" [(ngModel)]="vipPrice"
                     name="vip_price" placeholder="75.00" min="0">
            </div>
          </div>

          <!-- ── Seat Layout Toggle ────────────────────────────────────── -->
          <div class="seat-toggle-card">
            <div class="seat-toggle-header" (click)="toggleSeatMap()">
              <div>
                <div class="seat-toggle-title">🪑 Enable Seat Layout</div>
                <div class="seat-toggle-sub">
                  Let attendees pick specific seats from a visual map
                </div>
              </div>
              <label class="toggle-switch" (click)="$event.stopPropagation()">
                <input type="checkbox" [(ngModel)]="seatMapEnabled" name="seat_map_enabled"
                       (change)="onSeatMapToggle()">
                <span class="slider"></span>
              </label>
            </div>

            @if (seatMapEnabled) {
              <div class="seat-config" @fadeIn>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                  <div class="form-group" style="margin-bottom:0">
                    <label>Rows (A–Z) *</label>
                    <input type="number" class="form-control"
                           [(ngModel)]="seatRows" name="seat_rows"
                           placeholder="10" min="1" max="26"
                           (ngModelChange)="recalcTotal()">
                    <small class="form-hint">Max 26 rows (A–Z)</small>
                  </div>
                  <div class="form-group" style="margin-bottom:0">
                    <label>Seats per Row *</label>
                    <input type="number" class="form-control"
                           [(ngModel)]="seatColumns" name="seat_columns"
                           placeholder="20" min="1" max="100"
                           (ngModelChange)="recalcTotal()">
                    <small class="form-hint">Max 100 per row</small>
                  </div>
                </div>

                @if (seatRows && seatColumns) {
                  <div class="seat-preview">
                    <span class="preview-icon">🗺️</span>
                    <span>
                      Generates
                      <strong>{{ rowRangeLabel }}</strong> ×
                      <strong>1–{{ seatColumns }}</strong> =
                      <strong>{{ totalSeats }} seats</strong>
                    </span>
                  </div>

                  <!-- Mini visual preview -->
                  <div class="mini-map">
                    @for (r of previewRows; track r) {
                      <div class="mini-row">
                        <span class="mini-label">{{ r }}</span>
                        @for (c of previewCols; track c) {
                          <span class="mini-seat"></span>
                        }
                        @if (seatColumns > 8) {
                          <span class="mini-ellipsis">…</span>
                        }
                      </div>
                    }
                    @if (seatRows > 5) {
                      <div class="mini-more">+ {{ seatRows - 5 }} more row(s)</div>
                    }
                  </div>
                }
              </div>
            }
          </div>
          <!-- ──────────────────────────────────────────────────────────── -->

          <div style="display:flex;gap:12px;margin-top:24px">
            <button type="submit" class="btn btn-primary btn-lg" [disabled]="loading">
              @if (loading) {
                <span class="spinner" style="width:18px;height:18px;border-width:2px"></span>
              } @else { 🚀 Create Event }
            </button>
            <button type="button" class="btn btn-secondary btn-lg" (click)="cancel()">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .seat-toggle-card {
      border:1px solid rgba(124,58,237,.3); border-radius:12px;
      overflow:hidden; margin-top:8px;
    }
    .seat-toggle-header {
      display:flex; justify-content:space-between; align-items:center;
      padding:16px 20px; cursor:pointer;
      background:rgba(124,58,237,.05); transition:background .2s;
    }
    .seat-toggle-header:hover { background:rgba(124,58,237,.1); }
    .seat-toggle-title { font-weight:700; font-size:1rem; margin-bottom:4px; }
    .seat-toggle-sub { font-size:.8rem; color:var(--text-muted); }

    .toggle-switch { position:relative; display:inline-block; width:44px; height:24px; }
    .toggle-switch input { opacity:0; width:0; height:0; }
    .slider {
      position:absolute; inset:0; background:#374151; border-radius:24px;
      cursor:pointer; transition:.3s;
    }
    .slider::before {
      content:''; position:absolute; height:18px; width:18px;
      left:3px; bottom:3px; background:#fff; border-radius:50%; transition:.3s;
    }
    input:checked + .slider { background:var(--accent-color,#7c3aed); }
    input:checked + .slider::before { transform:translateX(20px); }

    .seat-config { padding:20px; border-top:1px solid rgba(124,58,237,.2); }
    .form-hint { font-size:.75rem; color:var(--text-muted); margin-top:4px; display:block; }

    .seat-preview {
      display:flex; align-items:center; gap:10px; padding:12px 16px;
      background:rgba(34,197,94,.08); border:1px solid rgba(34,197,94,.25);
      border-radius:8px; margin-top:16px; font-size:.9rem; color:var(--text-secondary);
    }
    .preview-icon { font-size:1.4rem; }

    .mini-map { margin-top:14px; display:flex; flex-direction:column; gap:4px; }
    .mini-row { display:flex; align-items:center; gap:3px; }
    .mini-label { width:20px; font-size:.65rem; font-weight:700; color:var(--text-muted); }
    .mini-seat {
      width:14px; height:14px; border-radius:3px 3px 2px 2px;
      background:rgba(34,197,94,.5); flex-shrink:0;
    }
    .mini-ellipsis { font-size:.7rem; color:var(--text-muted); margin-left:2px; }
    .mini-more { font-size:.7rem; color:var(--text-muted); margin-top:4px; padding-left:23px; }
  `]
})
export class EventCreateComponent {
  title = '';
  description = '';
  location = '';
  eventDate = '';
  maxTickets: number | null = null;
  ticketPrice: number | null = null;
  vipPrice: number | null = null;
  loading = false;
  error = '';

  // Seat map
  seatMapEnabled = false;
  seatRows: number | null = null;
  seatColumns: number | null = null;
  totalSeats = 0;
  rowRangeLabel = '';
  previewRows: string[] = [];
  previewCols: number[] = [];

  constructor(
    private eventService: EventService,
    private seatService: SeatService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  toggleSeatMap() {
    this.seatMapEnabled = !this.seatMapEnabled;
    this.onSeatMapToggle();
  }

  onSeatMapToggle() {
    if (this.seatMapEnabled) {
      this.recalcTotal();
    } else {
      this.totalSeats = 0;
    }
  }

  recalcTotal() {
    const r = this.seatRows ?? 0;
    const c = this.seatColumns ?? 0;
    this.totalSeats = r * c;

    // Row label range e.g. "A–J"
    const first = String.fromCharCode(65);
    const last = r > 0 ? String.fromCharCode(64 + Math.min(r, 26)) : '';
    this.rowRangeLabel = r > 0 ? `${first}–${last}` : '';

    // Update max_tickets to match seat total
    if (this.seatMapEnabled && this.totalSeats > 0) {
      this.maxTickets = this.totalSeats;
    }

    // Preview grid (max 5 rows, 8 cols)
    const pRows = Math.min(r, 5);
    const pCols = Math.min(c, 8);
    this.previewRows = Array.from({ length: pRows }, (_, i) => String.fromCharCode(65 + i));
    this.previewCols = Array.from({ length: pCols }, (_, i) => i + 1);
  }

  onSubmit() {
    if (this.seatMapEnabled) {
      if (!this.seatRows || this.seatRows < 1 || this.seatRows > 26) {
        this.error = 'Rows must be between 1 and 26.';
        return;
      }
      if (!this.seatColumns || this.seatColumns < 1 || this.seatColumns > 100) {
        this.error = 'Seats per row must be between 1 and 100.';
        return;
      }
    }

    this.loading = true;
    this.error = '';

    const payload: CreateEventPayload = {
      title: this.title,
      description: this.description || undefined,
      location: this.location || undefined,
      event_date: new Date(this.eventDate).toISOString(),
      max_tickets: this.maxTickets!,
      ticket_price: this.ticketPrice!,
      vip_price: this.vipPrice || undefined,
      seat_map_enabled: this.seatMapEnabled || undefined,
      seat_rows: this.seatMapEnabled ? this.seatRows! : undefined,
      seat_columns: this.seatMapEnabled ? this.seatColumns! : undefined,
    };

    this.eventService.createEvent(payload).subscribe({
      next: (event) => {
        if (this.seatMapEnabled) {
          // Generate seats before navigating
          this.seatService.generateSeats(event.id).pipe(
            finalize(() => {
              this.loading = false;
              this.router.navigate(['/events', event.id]);
            })
          ).subscribe({
            error: () => {
              // Seats failed — navigate anyway; organizer can regenerate
              this.router.navigate(['/events', event.id]);
            }
          });
        } else {
          this.loading = false;
          this.router.navigate(['/events', event.id]);
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || err.message || `Failed to create event (${err.status}).`;
      }
    });
  }

  cancel() { this.router.navigate(['/events']); }
}
