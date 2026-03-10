import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { EventService, ScanEvent } from '../../../core/services/event.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-event-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="page-container animate-fadeIn">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px">
        <div>
          <h1>🎪 <span class="gradient-text">Discover Events</span></h1>
          <p>Find and book tickets for amazing experiences</p>
        </div>
        @if (auth.isOrganizer) {
          <a routerLink="/events/create" class="btn btn-primary">➕ Create Event</a>
        }
      </div>

      <!-- Search bar -->
      <div class="search-bar glass-card" style="padding:16px;margin-bottom:24px">
        <input class="form-control" [(ngModel)]="searchTerm" (ngModelChange)="filterEvents()"
               placeholder="🔍 Search events by title or location..." style="background:transparent;border:none;box-shadow:none;font-size:1rem">
      </div>

      @if (loading) {
        <div class="loading-overlay">
          <div class="spinner"></div>
          <span>Loading events...</span>
        </div>
      } @else if (errorMsg) {
        <div class="alert alert-danger" style="margin-bottom:16px">{{ errorMsg }}</div>
        <button class="btn btn-secondary" (click)="loadEvents()">Retry</button>
      } @else if (filtered.length === 0) {
        <div class="glass-card" style="padding:60px;text-align:center">
          <span style="font-size:4rem;display:block;margin-bottom:16px">🎭</span>
          <h2>{{ searchTerm ? 'No events match your search' : 'No events yet' }}</h2>
          <p style="color:var(--text-secondary);margin-bottom:24px">
            {{ searchTerm ? 'Try a different search term' : 'Check back soon!' }}
          </p>
          @if (searchTerm) {
            <button class="btn btn-secondary" (click)="searchTerm=''; filterEvents()">Clear Search</button>
          }
        </div>
      } @else {
        <div class="grid-2">
          @for (event of filtered; track event.id) {
            <a [routerLink]="['/events', event.id]" class="event-card glass-card" style="text-decoration:none;color:inherit">
              <div class="event-card-body">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
                  <h3 style="font-size:1.15rem;font-family:'Outfit',sans-serif;line-height:1.3">{{ event.title }}</h3>
                  <span class="badge" [class]="getStatusClass(event.status)">{{ event.status }}</span>
                </div>

                @if (event.location) {
                  <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px">📍 {{ event.location }}</p>
                }

                @if (event.description) {
                  <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:16px;line-height:1.5">
                    {{ truncate(event.description) }}
                  </p>
                }

                <div class="event-meta">
                  <div class="meta-item">📅 {{ event.event_date | date:'mediumDate' }}</div>
                  <div class="meta-item">💰 &#36;{{ event.ticket_price }}</div>
                  <div class="meta-item">🎟️ {{ event.max_tickets - event.tickets_sold }} left</div>
                </div>

                <div class="progress-bar" style="margin-top:16px">
                  <div class="progress-fill" [style.width.%]="getSoldPct(event)"></div>
                </div>
                <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">
                  {{ event.tickets_sold }}/{{ event.max_tickets }} tickets sold
                </p>
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .search-bar input:focus { outline: none; }
    .event-card-body { padding: 24px; }
    .event-meta { display:flex; flex-wrap:wrap; gap:12px; }
    .meta-item { font-size:0.82rem; color:var(--text-secondary); }
    .progress-bar { height:4px; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden; }
    .progress-fill { height:100%; background:var(--accent-gradient); border-radius:2px; transition:width 0.5s ease; }
  `]
})
export class EventListComponent implements OnInit {
  events: ScanEvent[] = [];
  filtered: ScanEvent[] = [];
  searchTerm = '';
  loading = true;
  errorMsg = '';

  constructor(
    private eventService: EventService,
    public auth: AuthService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadEvents();
  }

  loadEvents() {
    this.loading = true;
    this.errorMsg = '';
    this.eventService.getEvents().pipe(
      finalize(() => { this.loading = false; this.cdr.detectChanges(); })
    ).subscribe({
      next: (events) => {
        this.events = events;
        this.filtered = events;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.errorMsg = err.error?.message || `Failed to load events (${err.status || 'network error'})`;
        this.cdr.detectChanges();
      }
    });
  }

  filterEvents() {
    const term = this.searchTerm.toLowerCase();
    if (!term) {
      this.filtered = this.events;
      return;
    }
    this.filtered = this.events.filter(e =>
      e.title.toLowerCase().includes(term) ||
      (e.location?.toLowerCase().includes(term) ?? false) ||
      (e.description?.toLowerCase().includes(term) ?? false)
    );
  }

  truncate(text: string): string {
    return text.length > 100 ? text.slice(0, 100) + '...' : text;
  }

  getSoldPct(event: ScanEvent): number {
    if (!event.max_tickets) return 0;
    return (event.tickets_sold / event.max_tickets) * 100;
  }

  getStatusClass(s: string) {
    return s === 'published' ? 'badge-success' : s === 'draft' ? 'badge-warning' : s === 'cancelled' ? 'badge-danger' : 'badge-info';
  }
}
