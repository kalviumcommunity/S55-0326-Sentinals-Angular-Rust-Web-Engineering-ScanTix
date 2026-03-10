import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { TicketService, Ticket, TicketWithQr } from '../../../core/services/ticket.service';
import { EventService, ScanEvent } from '../../../core/services/event.service';

@Component({
  selector: 'app-my-tickets',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="page-container animate-fadeIn">
      <div class="page-header">
        <h1>🎟️ <span class="gradient-text">My Tickets</span></h1>
        <p>View and manage your purchased tickets</p>
      </div>

      @if (loading) {
        <div class="loading-overlay"><div class="spinner"></div><span>Loading tickets...</span></div>
      } @else if (tickets.length === 0) {
        <div class="glass-card" style="padding:60px;text-align:center">
          <span style="font-size:4rem;display:block;margin-bottom:16px">🎫</span>
          <h2>No tickets yet</h2>
          <p style="color:var(--text-secondary);margin-bottom:24px">Browse events and grab your tickets!</p>
          <a routerLink="/events" class="btn btn-primary">Browse Events</a>
        </div>
      } @else {
        <!-- Stats row -->
        <div class="grid-4" style="margin-bottom:24px">
          <div class="stat-card glass-card">
            <div class="stat-label">Total Tickets</div>
            <div class="stat-value gradient-text">{{ tickets.length }}</div>
          </div>
          <div class="stat-card glass-card">
            <div class="stat-label">Valid</div>
            <div class="stat-value" style="color:var(--success)">{{ validCount }}</div>
          </div>
          <div class="stat-card glass-card">
            <div class="stat-label">Used</div>
            <div class="stat-value" style="color:var(--info)">{{ usedCount }}</div>
          </div>
          <div class="stat-card glass-card">
            <div class="stat-label">Events</div>
            <div class="stat-value" style="color:var(--warning)">{{ eventCount }}</div>
          </div>
        </div>

        <div class="grid-3">
          @for (ticket of tickets; track ticket.id) {
            <div class="glass-card ticket-card" style="padding:0;overflow:hidden;cursor:pointer"
                 (click)="openTicket(ticket)">
              <!-- Top stripe -->
              <div class="ticket-stripe" [class]="ticket.status === 'valid' ? 'stripe-green' : ticket.status === 'used' ? 'stripe-blue' : 'stripe-red'"></div>

              <div style="padding:20px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                  <span style="font-size:2rem">🎟️</span>
                  <span class="badge" [class]="ticket.status === 'valid' ? 'badge-success' : ticket.status === 'used' ? 'badge-info' : 'badge-danger'">
                    {{ ticket.status | uppercase }}
                  </span>
                </div>

                <p style="font-size:0.78rem;color:var(--text-muted);font-family:monospace;margin-bottom:8px">
                  #{{ ticket.id.slice(0, 16) }}...
                </p>
                <p style="font-size:0.82rem;color:var(--text-secondary)">
                  📅 {{ ticket.created_at | date:'mediumDate' }}
                </p>
                <p style="font-size:0.78rem;color:var(--accent-primary);margin-top:8px;font-weight:500">
                  Tap to view QR code →
                </p>
              </div>
            </div>
          }
        </div>
      }

      <!-- QR Modal -->
      @if (selectedTicket) {
        <div class="modal-backdrop" (click)="closeModal()">
          <div class="modal-card glass-card" (click)="$event.stopPropagation()">
            <button class="modal-close" (click)="closeModal()">✕</button>

            <div style="text-align:center">
              <span style="font-size:2.5rem;display:block;margin-bottom:12px">🎟️</span>
              <h2 style="margin-bottom:4px">Your Ticket</h2>
              <p style="font-family:monospace;color:var(--text-muted);font-size:0.8rem;margin-bottom:16px">
                #{{ selectedTicket.id }}
              </p>
              <span class="badge" style="margin-bottom:24px;display:inline-block"
                    [class]="selectedTicket.status === 'valid' ? 'badge-success' : selectedTicket.status === 'used' ? 'badge-info' : 'badge-danger'">
                {{ selectedTicket.status | uppercase }}
              </span>

              @if (qrLoading) {
                <div class="loading-overlay" style="padding:40px"><div class="spinner"></div></div>
              } @else if (qrData) {
                <div class="qr-wrapper">
                  <img [src]="'data:image/png;base64,' + qrData.qr_image_base64" alt="QR Code" class="qr-img">
                </div>
                <p style="color:var(--text-muted);font-size:0.82rem;margin-top:16px">
                  Show this QR code at the event entrance
                </p>
                @if (selectedTicket.status === 'used' && selectedTicket.scanned_at) {
                  <p style="color:var(--info);font-size:0.82rem;margin-top:8px">
                    ✅ Scanned {{ selectedTicket.scanned_at | date:'medium' }}
                  </p>
                }
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .ticket-card { transition:all 0.2s ease; }
    .ticket-card:hover { transform:translateY(-4px); box-shadow:0 8px 30px rgba(124,58,237,0.2); }
    .ticket-stripe { height:5px; }
    .stripe-green { background: linear-gradient(90deg, #10b981, #059669); }
    .stripe-blue { background: linear-gradient(90deg, #06b6d4, #0891b2); }
    .stripe-red { background: linear-gradient(90deg, #ef4444, #dc2626); }

    .modal-backdrop {
      position:fixed; inset:0; background:rgba(0,0,0,0.6);
      backdrop-filter:blur(8px); z-index:200;
      display:flex; align-items:center; justify-content:center; padding:24px;
    }
    .modal-card {
      width:100%; max-width:420px; padding:40px;
      position:relative; animation:fadeIn 0.2s ease;
    }
    .modal-close {
      position:absolute; top:16px; right:16px;
      background:var(--bg-card); border:1px solid var(--border-glass);
      color:var(--text-secondary); border-radius:50%;
      width:32px; height:32px; cursor:pointer; font-size:0.9rem;
      display:flex; align-items:center; justify-content:center;
      transition:all 0.2s;
    }
    .modal-close:hover { background:var(--bg-card-hover); color:var(--text-primary); }
    .qr-wrapper { background:white; border-radius:12px; padding:20px; display:inline-block; }
    .qr-img { width:220px; height:220px; image-rendering:pixelated; display:block; }
  `]
})
export class MyTicketsComponent implements OnInit {
  tickets: Ticket[] = [];
  selectedTicket: Ticket | null = null;
  qrData: TicketWithQr | null = null;
  loading = true;
  qrLoading = false;

  constructor(
    private ticketService: TicketService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.ticketService.getMyTickets().subscribe({
      next: (tickets) => {
        this.tickets = tickets;
        this.loading = false;
        const id = this.route.snapshot.queryParamMap.get('id') || this.route.snapshot.paramMap.get('id');
        if (id) {
          const t = tickets.find(t => t.id === id);
          if (t) this.openTicket(t);
        }
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); }
    });
  }

  openTicket(ticket: Ticket) {
    this.selectedTicket = ticket;
    this.qrData = null;
    this.qrLoading = true;
    this.cdr.detectChanges();
    this.ticketService.getTicketQr(ticket.id).subscribe({
      next: (data) => { this.qrData = data; this.qrLoading = false; this.cdr.detectChanges(); },
      error: () => { this.qrLoading = false; this.cdr.detectChanges(); }
    });
  }

  closeModal() { this.selectedTicket = null; this.qrData = null; }

  get validCount() { return this.tickets.filter(t => t.status === 'valid').length; }
  get usedCount() { return this.tickets.filter(t => t.status === 'used').length; }
  get eventCount() { return new Set(this.tickets.map(t => t.event_id)).size; }
}
