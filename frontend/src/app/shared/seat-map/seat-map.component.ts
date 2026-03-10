import {
  Component, Input, Output, EventEmitter, OnInit, OnDestroy,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SeatService, EventSeat } from '../../core/services/seat.service';

interface SeatRow {
  label: string;
  seats: EventSeat[];
}

@Component({
  selector: 'app-seat-map',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="seat-map-wrapper">
      <!-- Stage -->
      <div class="stage-bar">🎭 STAGE / SCREEN</div>

      <!-- Legend -->
      <div class="legend">
        <span class="legend-item"><span class="dot available"></span>Available</span>
        <span class="legend-item"><span class="dot mine"></span>Selected by you</span>
        <span class="legend-item"><span class="dot locked"></span>Held by someone</span>
        <span class="legend-item"><span class="dot booked"></span>Booked</span>
      </div>

      @if (loading) {
        <div class="map-loading"><div class="spinner"></div><span>Loading seat map…</span></div>
      } @else if (rows.length === 0) {
        <div class="map-empty">No seats configured for this event.</div>
      } @else {
        <!-- Seat grid -->
        <div class="grid-scroll">
          @for (row of rows; track row.label) {
            <div class="seat-row">
              <div class="row-label">{{ row.label }}</div>
              @for (seat of row.seats; track seat.id) {
                <button
                  class="seat"
                  [class]="getSeatClass(seat)"
                  [disabled]="isSeatDisabled(seat)"
                  [title]="getSeatTooltip(seat)"
                  (click)="onSeatClick(seat)"
                >
                  {{ seat.seat_number }}
                  @if (isMyLock(seat) && getCountdown(seat); as cd) {
                    <span class="countdown">{{ cd }}</span>
                  }
                </button>
              }
            </div>
          }
        </div>
      }

      @if (mySeats.length > 0) {
        <div class="selection-summary">
          <span>{{ mySeats.length }} seat(s) selected:</span>
          @for (s of mySeats; track s.id) {
            <span class="tag">
              {{ s.row_label }}{{ s.seat_number }}
              <button class="tag-remove" (click)="deselect(s)">✕</button>
            </span>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .seat-map-wrapper { display:flex; flex-direction:column; gap:16px; }

    .stage-bar {
      text-align:center; padding:10px 24px;
      background:linear-gradient(135deg,rgba(124,58,237,.25),rgba(99,102,241,.25));
      border:1px solid rgba(124,58,237,.4); border-radius:8px;
      font-weight:700; letter-spacing:.1em; font-size:.85rem; color:var(--text-secondary);
    }

    .legend { display:flex; gap:20px; flex-wrap:wrap; justify-content:center; }
    .legend-item { display:flex; align-items:center; gap:6px; font-size:.8rem; color:var(--text-secondary); }
    .dot { width:14px; height:14px; border-radius:3px; }
    .dot.available { background:#22c55e; }
    .dot.mine { background:#7c3aed; }
    .dot.locked { background:#f59e0b; }
    .dot.booked { background:#6b7280; }

    .map-loading, .map-empty {
      display:flex; align-items:center; gap:12px; justify-content:center;
      padding:40px; color:var(--text-muted);
    }

    .grid-scroll { overflow-x:auto; }
    .seat-row { display:flex; align-items:center; gap:6px; margin-bottom:6px; min-width:max-content; }
    .row-label {
      width:28px; font-size:.75rem; font-weight:700; color:var(--text-muted);
      text-align:center; flex-shrink:0;
    }

    .seat {
      position:relative;
      width:36px; height:36px; border-radius:6px 6px 3px 3px;
      border:none; font-size:.7rem; font-weight:600;
      cursor:pointer; transition:transform .1s, box-shadow .1s;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
    }
    .seat:hover:not(:disabled) { transform:scale(1.15); box-shadow:0 4px 14px rgba(0,0,0,.4); }
    .seat:disabled { cursor:not-allowed; opacity:.85; }

    .seat.available { background:#22c55e; color:#fff; }
    .seat.mine { background:linear-gradient(135deg,#7c3aed,#6366f1); color:#fff; box-shadow:0 0 10px rgba(124,58,237,.5); }
    .seat.locked { background:#f59e0b; color:#fff; }
    .seat.booked { background:#374151; color:#9ca3af; }

    .countdown {
      position:absolute; bottom:-16px; left:50%; transform:translateX(-50%);
      font-size:.6rem; color:#a78bfa; white-space:nowrap; pointer-events:none;
    }

    .selection-summary {
      display:flex; flex-wrap:wrap; gap:8px; align-items:center;
      padding:12px 16px; background:rgba(124,58,237,.08);
      border-radius:8px; border:1px solid rgba(124,58,237,.2);
      font-size:.85rem; color:var(--text-secondary);
    }
    .tag {
      display:inline-flex; align-items:center; gap:6px;
      background:rgba(124,58,237,.2); border-radius:20px;
      padding:3px 10px; font-size:.8rem; color:var(--text-primary);
    }
    .tag-remove {
      background:none; border:none; cursor:pointer; padding:0;
      color:var(--text-muted); font-size:.75rem; line-height:1;
    }
    .tag-remove:hover { color:#ef4444; }
  `]
})
export class SeatMapComponent implements OnInit, OnDestroy {
  @Input() eventId!: string;
  @Input() currentUserId: string | null = null;

  @Output() selectionChanged = new EventEmitter<EventSeat[]>();

  rows: SeatRow[] = [];
  mySeats: EventSeat[] = [];  // seats locked by current user in this session
  loading = true;

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private seatsMap = new Map<string, EventSeat>();

  constructor(
    private seatService: SeatService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.loadSeats();
    // Poll every 5 seconds for real-time updates
    this.pollInterval = setInterval(() => this.loadSeats(), 5000);
    // Tick countdown every second
    this.timerInterval = setInterval(() => this.cdr.markForCheck(), 1000);
  }

  ngOnDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  private loadSeats() {
    this.seatService.getEventSeats(this.eventId).subscribe({
      next: (seats) => {
        seats.forEach(s => {
          const local = this.seatsMap.get(s.id);
          const isOptimisticMine = local?.status === 'locked' && local?.locked_by === this.currentUserId;

          if (isOptimisticMine) {
            // If server says someone else booked/locked it, we lost our lock priority.
            if (s.status === 'booked' || (s.status === 'locked' && s.locked_by !== this.currentUserId)) {
              this.seatsMap.set(s.id, s);
            } else if (s.status === 'locked' && s.locked_by === this.currentUserId) {
              // Server confirmed our lock; update lock_until for exact countdown
              this.seatsMap.set(s.id, s);
            }
            // If server says 'available', the lock API might still be inflight.
            // We KEEP our local 'locked' state so the UI doesn't flicker.
          } else {
            // Not ours locally, so trust the server state completely.
            this.seatsMap.set(s.id, s);
          }
        });

        // Rebuild mySeats from seatsMap (so if server rejected us, it's removed here)
        this.mySeats = Array.from(this.seatsMap.values())
          .filter(s => s.status === 'locked' && s.locked_by === this.currentUserId);

        this.rows = this.buildRows(Array.from(this.seatsMap.values()));
        this.loading = false;
        this.selectionChanged.emit(this.mySeats);
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  private buildRows(seats: EventSeat[]): SeatRow[] {
    const map = new Map<string, EventSeat[]>();
    for (const seat of seats) {
      const arr = map.get(seat.row_label) ?? [];
      arr.push(seat);
      map.set(seat.row_label, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, s]) => ({
        label,
        seats: s.sort((a, b) => a.seat_number - b.seat_number)
      }));
  }

  isMyLock(seat: EventSeat): boolean {
    return this.mySeats.some(s => s.id === seat.id);
  }

  isSeatDisabled(seat: EventSeat): boolean {
    if (this.isMyLock(seat)) return false;
    return seat.status !== 'available';
  }

  getSeatClass(seat: EventSeat): string {
    if (this.isMyLock(seat)) return 'mine';
    if (seat.status === 'locked') return 'locked';
    if (seat.status === 'booked') return 'booked';
    return 'available';
  }

  getSeatTooltip(seat: EventSeat): string {
    if (this.isMyLock(seat)) {
      const cd = this.getCountdown(seat);
      return cd ? `Your seat — expires in ${cd}` : 'Your seat';
    }
    if (seat.status === 'locked') return 'Held by another user';
    if (seat.status === 'booked') return 'Already booked';
    return `Row ${seat.row_label}, Seat ${seat.seat_number}`;
  }

  getCountdown(seat: EventSeat): string | null {
    if (!seat.locked_until) return null;
    const remaining = new Date(seat.locked_until).getTime() - Date.now();
    if (remaining <= 0) return null;
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  onSeatClick(seat: EventSeat) {
    if (this.isMyLock(seat)) {
      this.deselect(seat);
    } else if (seat.status === 'available') {
      this.lockSeat(seat);
    }
  }

  private lockSeat(seat: EventSeat) {
    // Optimistically mark as mine
    seat.status = 'locked';
    seat.locked_by = this.currentUserId;
    this.seatsMap.set(seat.id, seat);
    this.mySeats = [...this.mySeats, seat];
    this.rows = this.buildRows(Array.from(this.seatsMap.values()));
    this.cdr.markForCheck();

    this.seatService.lockSeat(this.eventId, seat.id).subscribe({
      next: (resp) => {
        // Update with accurate server lock_until
        const updated = { ...resp.seat };
        this.seatsMap.set(updated.id, updated);
        this.mySeats = this.mySeats.map(s => s.id === updated.id ? updated : s);
        this.rows = this.buildRows(Array.from(this.seatsMap.values()));
        this.selectionChanged.emit(this.mySeats);
        this.cdr.markForCheck();
      },
      error: () => {
        // Revert optimistic update
        seat.status = 'available';
        seat.locked_by = null;
        this.seatsMap.set(seat.id, seat);
        this.mySeats = this.mySeats.filter(s => s.id !== seat.id);
        this.rows = this.buildRows(Array.from(this.seatsMap.values()));
        this.selectionChanged.emit(this.mySeats);
        this.cdr.markForCheck();
      }
    });
  }

  deselect(seat: EventSeat) {
    this.mySeats = this.mySeats.filter(s => s.id !== seat.id);
    // Optimistically set available
    seat.status = 'available';
    seat.locked_by = null;
    seat.locked_until = null;
    this.seatsMap.set(seat.id, seat);
    this.rows = this.buildRows(Array.from(this.seatsMap.values()));
    this.selectionChanged.emit(this.mySeats);
    this.cdr.markForCheck();

    this.seatService.unlockSeat(this.eventId, seat.id).subscribe();
  }
}
