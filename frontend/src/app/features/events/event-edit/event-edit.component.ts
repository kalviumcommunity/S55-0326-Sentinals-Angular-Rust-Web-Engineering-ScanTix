import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { finalize, Subject, debounceTime, distinctUntilChanged, switchMap, tap, of } from 'rxjs';
import { EventService, UpdateEventPayload, ScanEvent } from '../../../core/services/event.service';
import { SeatService } from '../../../core/services/seat.service';
import { LocationService, LocationSuggestion } from '../../../core/services/location.service';
import { ImageCropperComponent, CroppedEvent } from '../../../shared/image-cropper/image-cropper.component';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-event-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ImageCropperComponent],
  template: `
    <div class="page-container animate-fadeIn">
      <div class="page-header" style="text-align: center; margin-bottom: 32px;">
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:8px">
          <h1>✏️ <span class="gradient-text">Update Event</span></h1>
          @if (ticketsSold > 0) {
            <span class="badge badge-warning">LOCKED FIELDS</span>
          }
        </div>
        <p>Update your event details. Some fields are locked once tickets are sold.</p>
      </div>

      <div class="glass-card" style="padding:40px;max-width:760px;margin: 0 auto;">
        @if (error) { <div class="alert alert-danger">{{ error }}</div> }
        @if (success) { <div class="alert alert-success">{{ success }}</div> }

        @if (initialLoading) {
          <div style="text-align:center;padding:40px">
            <div class="spinner"></div>
            <p>Loading event data...</p>
          </div>
        } @else {
          <form #eventForm="ngForm" (ngSubmit)="onSubmit()">
            <div class="form-group">
              <label>Event Title *</label>
              <input class="form-control" [(ngModel)]="title" name="title" placeholder="Event Title" required>
            </div>

            <div class="form-group">
              <label>Description *</label>
              <textarea class="form-control" [(ngModel)]="description" name="description"
                        placeholder="Tell attendees what makes this event special..." rows="4" required></textarea>
            </div>

            <div class="form-group" style="position:relative">
              <label>📍 Location *</label>
              <input class="form-control" [(ngModel)]="location" name="location"
                     [disabled]="ticketsSold > 0"
                     placeholder="e.g. Phoenix Marketcity, Pune" required
                     (ngModelChange)="onLocationInput($event)" autocomplete="off">
              
              @if (isSearchingLocation) {
                <div class="location-spinner"></div>
              }

              @if (locationSuggestions.length > 0) {
                <div class="location-suggestions-dropdown glass-card">
                  @for (sugg of locationSuggestions; track sugg.displayName) {
                    <div class="suggestion-item" (click)="selectLocation(sugg)">
                      <div class="suggestion-name">{{ sugg.city || sugg.displayName }}</div>
                      <div class="suggestion-details">{{ sugg.displayName }}</div>
                    </div>
                  }
                </div>
              }
              @if (ticketsSold > 0) {
                <small class="form-hint" style="color:var(--warning)">Location cannot be changed after tickets are sold.</small>
              }
            </div>

            <div class="form-group">
              <label>📸 Event Photos (Existing & New) *</label>
              <div class="custom-file-input" style="margin-bottom: 12px;">
                <button type="button" class="btn-file-select" (click)="fileInput.click()">Add Photos</button>
                <span class="file-name-label">
                  {{ selectedFiles.length + existingImageUrls.length }} file(s) total
                </span>
                <input #fileInput type="file" style="display:none" multiple accept="image/*" (change)="onFilesSelected($event)">
              </div>
              
              <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
                <!-- Existing Images -->
                @for (url of existingImageUrls; track url; let i = $index) {
                  <div style="position:relative;width:100px;height:100px;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.1)">
                    <img [src]="getImageUrl(url)" style="width:100%;height:100%;object-fit:cover">
                    <button type="button" (click)="removeExistingFile(i)" 
                            style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);border:none;color:white;border-radius:50%;width:24px;height:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px">✕</button>
                    @if (i === 0) {
                      <span style="position:absolute;bottom:0;left:0;right:0;background:rgba(234,179,8,0.8);color:#000;font-weight:600;font-size:10px;text-align:center;padding:2px 0">COVER</span>
                    }
                  </div>
                }
                <!-- New Uploaded Images -->
                @for (file of selectedFiles; track file.name; let i = $index) {
                  <div style="position:relative;width:100px;height:100px;border-radius:8px;overflow:hidden;border:1px solid var(--accent-primary); box-shadow: 0 0 10px rgba(168, 85, 247, 0.25)">
                    <img [src]="filePreviewUrls[i]" style="width:100%;height:100%;object-fit:cover">
                    <button type="button" (click)="removeFile(i)" 
                            style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,0.6);border:none;color:white;border-radius:50%;width:24px;height:24px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px">✕</button>
                    <span style="position:absolute;bottom:0;left:0;right:0;background:var(--accent-primary);color:#000;font-weight:600;font-size:9px;text-align:center;padding:1px 0">NEW</span>
                  </div>
                }
              </div>
              <small class="form-hint">Photos are updated immediately. The first photo is yours cover photo.</small>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
              <div class="form-group">
                <label>Event Date & Time *</label>
                <input type="datetime-local" class="form-control" [(ngModel)]="eventDate" name="event_date" 
                       [disabled]="ticketsSold > 0" required>
                @if (ticketsSold > 0) {
                  <small class="form-hint" style="color:var(--warning)">Date cannot be changed after tickets are sold.</small>
                }
              </div>
              <div class="form-group">
                <label>Max Tickets *</label>
                <input type="text" class="form-control" [(ngModel)]="maxTickets" name="max_tickets"
                       placeholder="500" [disabled]="seatMapEnabled" 
                       (input)="enforceNumeric($event)" required>
                @if (ticketsSold > 0) {
                  <small class="form-hint">Must be at least {{ ticketsSold }} (already sold).</small>
                }
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
              <div class="form-group">
                <label>🚪 Gate Opens At *</label>
                <input type="datetime-local" class="form-control" [(ngModel)]="gateOpenTime" name="gate_open_time"
                       [disabled]="ticketsSold > 0" required>
              </div>
              <div class="form-group">
                <label>🏁 Event Ends At *</label>
                <input type="datetime-local" class="form-control" [(ngModel)]="eventEndTime" name="event_end_time"
                       [disabled]="ticketsSold > 0" required>
              </div>
            </div>

            <div class="form-group">
              <label>🗺️ Google Maps Venue Link *</label>
              <input type="url" class="form-control" [(ngModel)]="googleMapsUrl" name="google_maps_url"
                     placeholder="https://maps.google.com/..." required>
              @if (googleMapsUrl && !isValidMapsUrl(googleMapsUrl)) {
                <span style="color:var(--danger);font-size:0.78rem">Please enter a valid URL (must start with http)</span>
              }
            </div>

            <div [style.display]="seatMapEnabled ? 'grid' : 'block'" [style.grid-template-columns]="seatMapEnabled ? '1fr 1fr' : 'none'" style="gap:20px">
              <div class="form-group">
                <label>Ticket Price (₹) *</label>
                <input type="text" class="form-control" [(ngModel)]="ticketPrice"
                       [disabled]="ticketsSold > 0" name="ticket_price"
                       (input)="enforceDecimal($event)" required>
              </div>
              @if (seatMapEnabled) {
                <div class="form-group">
                  <label>VIP Price (₹) *</label>
                  <input type="text" class="form-control" [(ngModel)]="vipPrice"
                         [disabled]="ticketsSold > 0" name="vip_price"
                         (input)="enforceDecimal($event)" required>
                </div>
              }
            </div>

            <div class="form-group">
              <label>Refund Policy *</label>
              <div class="custom-select-wrapper">
                <select class="form-control custom-select" [(ngModel)]="refundPolicy" name="refund_policy" required>
                  <option value="NON_REFUNDABLE">🔒 Non-Refundable</option>
                  <option value="REFUNDABLE">💸 Refundable (– 24h)</option>
                </select>
              </div>
            </div>

            <!-- ── Seat Layout Toggle ────────────────────────────────────── -->
            <div class="seat-toggle-card">
              <div class="seat-toggle-header" (click)="ticketsSold === 0 ? toggleSeatMap() : null" [style.cursor]="ticketsSold > 0 ? 'not-allowed' : 'pointer'">
                <div>
                  <div class="seat-toggle-title">🪑 Enable Seat Layout</div>
                  <div class="seat-toggle-sub">
                    Let attendees pick specific seats from a visual map
                  </div>
                </div>
                <label class="toggle-switch" (click)="$event.stopPropagation()">
                  <input type="checkbox" [(ngModel)]="seatMapEnabled" name="seat_map_enabled"
                         [disabled]="ticketsSold > 0" (change)="onSeatMapToggle()">
                  <span class="slider"></span>
                </label>
              </div>

              @if (seatMapEnabled) {
                <div class="seat-config">
                  <div class="form-group" style="margin-bottom:16px">
                    <label>Layout Style</label>
                    <div style="display:flex;gap:16px;margin-top:8px">
                      <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                        <input type="radio" name="seat_layout" [(ngModel)]="seatLayout" value="grid" [disabled]="ticketsSold > 0"> Grid View
                      </label>
                      <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                        <input type="radio" name="seat_layout" [(ngModel)]="seatLayout" value="stadium" [disabled]="ticketsSold > 0"> Stadium View
                      </label>
                    </div>
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
                    <div class="form-group" style="margin-bottom:0">
                      <label>Rows *</label>
                      <input type="number" class="form-control"
                             [(ngModel)]="seatRows" name="seat_rows"
                             placeholder="10" min="1" max="500"
                             [disabled]="ticketsSold > 0"
                             (ngModelChange)="recalcTotal()">
                    </div>
                    <div class="form-group" style="margin-bottom:0">
                      <label>Seats per Row *</label>
                      <input type="number" class="form-control"
                             [(ngModel)]="seatColumns" name="seat_columns"
                             placeholder="20" min="1" max="100"
                             [disabled]="ticketsSold > 0"
                             (ngModelChange)="recalcTotal()">
                    </div>
                  </div>
                  @if (ticketsSold > 0) {
                    <small class="form-hint" style="color:var(--warning)">Seat configuration cannot be changed after tickets are sold.</small>
                  }

                  @if (seatRows && seatColumns) {
                    <div class="seat-preview">
                      <span>
                        Generates <strong>{{ totalSeats }} seats</strong> ({{ seatRows }} rows × {{ seatColumns }} seats)
                      </span>
                    </div>

                    <!-- Mini visual preview -->
                    <div class="mini-map-wrapper" style="margin-top: 20px;">
                      @if (seatLayout === 'grid') {
                        <div class="mini-map">
                          <div class="mini-rows-container">
                            @for (r of previewRows; track r; let i = $index) {
                              <div class="mini-row">
                                <span class="mini-label">{{ r }}</span>
                                @for (c of previewCols; track c) {
                                  <span class="mini-seat"></span>
                                }
                                @if (seatColumns! > 8) {
                                  <span class="mini-ellipsis">…</span>
                                }
                              </div>
                            }
                          </div>
                          @if (seatRows! > 5) {
                            <div class="mini-more">+ {{ seatRows! - 5 }} more row(s)</div>
                          }
                        </div>
                      } @else {
                        <div class="mini-stadium-container">
                          <div class="mini-pitch">PITCH</div>
                          @for (r of previewRows; track r; let rIdx = $index) {
                            @for (c of previewCols; track c; let cIdx = $index) {
                              <div class="stadium-mini-seat" [ngStyle]="getMiniStadiumSeatStyle(rIdx, cIdx, previewCols.length)"></div>
                            }
                          }
                        </div>
                        @if (seatRows! > 5 || seatColumns! > 8) {
                          <div class="mini-more">+ more seats hidden in preview</div>
                        }
                      }
                    </div>
                  }
                </div>
              }
            </div>

            <div style="display:flex;gap:16px;margin-top:40px;justify-content:center">
              <button type="button" class="btn-secondary-outline btn-lg" (click)="cancel()" style="min-width:160px">
                Back
              </button>
              <button type="submit" class="btn-update-premium btn-lg" [disabled]="loading || !eventForm.valid" style="min-width:240px">
                @if (loading) { 
                  <span class="spinner" style="width:20px;height:20px;border-width:2px;margin-right:8px"></span> 
                  UPDATING... 
                } @else { 
                   UPDATE EVENT 
                }
              </button>
            </div>
          </form>
        }
      </div>
    </div>

    <!-- Custom Canvas Image Cropper Modal -->
    @if (imageFile) {
      <app-image-cropper
        [imageFile]="imageFile"
        [aspectRatio]="16/9"
        (imageCropped)="onImageCropped($event)"
        (cropCanceled)="cancelCrop()">
      </app-image-cropper>
    }
  `,
  styles: [`
    .form-hint { font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; display: block; }
    .alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 24px; font-size: 0.95rem; }
    .alert-danger { background: rgba(239, 68, 68, 0.1); border: 1px solid var(--danger); color: #fca5a5; }
    .alert-success { background: rgba(34, 197, 94, 0.1); border: 1px solid var(--success); color: #86efac; }
    .custom-file-input { display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; }
    .btn-file-select { background: #374151; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-size: 0.85rem; cursor: pointer; }
    .file-name-label { font-size: 0.9rem; color: var(--text-secondary); }
    .location-suggestions-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 100; margin-top: 4px; background: #18181b; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .suggestion-item { padding: 10px 16px; cursor: pointer; }
    .suggestion-item:hover { background: rgba(255,255,255,0.05); }
    .location-spinner { position: absolute; right: 12px; top: 42px; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.1); border-top-color: var(--primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
    .seat-toggle-card { border:1px solid rgba(234,179,8,.3); border-radius:12px; overflow:hidden; margin-top:8px; }
    .seat-toggle-header { padding:16px 20px; display:flex; justify-content:space-between; align-items:center; background:rgba(234,179,8,.05); }
    .seat-toggle-title { font-weight:600; font-size:1.1rem; color:var(--text-primary); margin-bottom:4px; }
    .seat-toggle-sub { font-size:.85rem; color:var(--text-muted); }
    .toggle-switch { position:relative; display:inline-block; width:44px; height:24px; }
    .toggle-switch input { opacity:0; width:0; height:0; }
    .slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:rgba(255,255,255,.1); transition:.4s; border-radius:24px; }
    .slider::before { position:absolute; content:""; height:18px; width:18px; left:3px; bottom:3px; background-color:white; transition:.4s; border-radius:50%; }
    input:checked + .slider { background:#eab308; }
    input:checked + .slider::before { transform:translateX(20px); }
    .seat-config { padding:20px; border-top:1px solid rgba(234,179,8,.2); }
    .seat-preview { display:flex; align-items:center; justify-content:center; padding:12px 16px; background:rgba(34,197,94,.08); border:1px solid rgba(34,197,94,.25); border-radius:8px; margin-top:16px; font-size:.9rem; color:var(--text-secondary); }
    .mini-map { margin-top:14px; display:flex; flex-direction:column; gap:4px; align-items:center; }
    .mini-rows-container { display:flex; flex-direction:column; gap:4px; width:100%; align-items:center; }
    .mini-row { display: flex; gap: 4px; align-items: center; justify-content: center; width: 100%; }
    .mini-label { font-size: 0.65rem; color: var(--text-muted); width: 14px; text-align: right; }
    .mini-seat { width: 10px; height: 10px; background: rgba(56, 189, 248, 0.4); border-radius: 2px; }
    .mini-stadium-container { position: relative; width: 140px; height: 140px; margin: 10px auto; border-radius: 50%; background: rgba(34,197,94,.1); }
    .mini-pitch { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 25px; height: 50px; background: rgba(202, 92, 24, 0.4); border: 1px solid rgba(202, 92, 24, 0.6); font-size: 0.4rem; color: #fef3c7; display: flex; align-items: center; justify-content: center; writing-mode: vertical-lr; text-orientation: upright; }
    .stadium-mini-seat { position: absolute; width: 6px; height: 6px; background: rgba(56, 189, 248, 0.5); border-radius: 2px 2px 0 0; top: 50%; left: 50%; margin-left: -3px; margin-top: -3px; }
    
    .btn-update-premium {
      background: linear-gradient(135deg, #eab308 0%, #ca8a04 100%);
      color: #000;
      border: none;
      font-weight: 700;
      padding: 14px 28px;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 4px 15px rgba(168, 85, 247, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .btn-update-premium:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(168, 85, 247, 0.5);
      filter: brightness(1.1);
    }
    .btn-update-premium:active:not(:disabled) {
      transform: translateY(0);
    }
    .btn-update-premium:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      filter: grayscale(0.5);
    }
    .btn-secondary-outline {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-primary);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 14px 28px;
      border-radius: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-secondary-outline:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }
  `]
})
export class EventEditComponent implements OnInit {
  eventId: string = '';
  ticketsSold: number = 0;

  title = '';
  description = '';
  location = '';
  eventDate = '';
  gateOpenTime = '';
  eventEndTime = '';
  googleMapsUrl = '';
  maxTickets: number | null = null;
  ticketPrice: number | null = null;
  vipPrice: number | null = null;
  refundPolicy: 'REFUNDABLE' | 'NON_REFUNDABLE' = 'NON_REFUNDABLE';

  initialLoading = true;
  loading = false;
  error = '';
  success = '';

  // Photos
  existingImageUrls: string[] = [];
  selectedFiles: File[] = [];
  filePreviewUrls: string[] = [];
  pendingFilesToCrop: File[] = [];
  imageFile: File | null = null;
  currentProcessingFileName: string = '';

  // Location suggestions
  private locationSearch$ = new Subject<string>();
  locationSuggestions: LocationSuggestion[] = [];
  isSearchingLocation = false;

  // Seat map
  seatMapEnabled = false;
  seatLayout: 'grid' | 'stadium' = 'grid';
  seatRows: number | null = null;
  seatColumns: number | null = null;
  totalSeats = 0;
  previewRows: string[] = [];
  previewCols: number[] = [];


  constructor(
    private eventService: EventService,
    private seatService: SeatService,
    private locationService: LocationService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.eventId = this.route.snapshot.params['id'];
    this.fetchEvent();

    // Setup location search
    this.locationSearch$.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      switchMap(query => {
        if (query.length < 2) {
          this.locationSuggestions = [];
          return of([]);
        }
        this.isSearchingLocation = true;
        this.cdr.detectChanges();
        return this.locationService.searchCities(query).pipe(
          finalize(() => {
            this.isSearchingLocation = false;
            this.cdr.detectChanges();
          })
        );
      })
    ).subscribe(suggestions => {
      this.locationSuggestions = suggestions;
      this.cdr.detectChanges();
    });
  }

  fetchEvent() {
    this.initialLoading = true;
    this.eventService.getEvent(this.eventId).subscribe({
      next: (event) => {
        this.ticketsSold = event.tickets_sold;
        this.title = event.title;
        this.description = event.description || '';
        this.location = event.location || '';
        this.eventDate = this.formatDate(event.event_date);
        this.gateOpenTime = this.formatDate(event.gate_open_time || '');
        this.eventEndTime = this.formatDate(event.event_end_time || '');
        this.googleMapsUrl = event.google_maps_url || '';
        this.maxTickets = event.max_tickets;
        this.ticketPrice = parseFloat(event.ticket_price || '0');
        this.vipPrice = parseFloat(event.vip_price || '0');
        this.refundPolicy = event.refund_policy as any || 'NON_REFUNDABLE';

        this.existingImageUrls = event.image_urls || [];
        this.seatMapEnabled = event.seat_map_enabled;
        this.seatLayout = event.seat_layout || 'grid';
        this.seatRows = event.seat_rows;
        this.seatColumns = event.seat_columns;

        if (this.seatMapEnabled) {
          this.recalcTotal();
        }

        this.initialLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = 'Failed to load event details.';
        this.initialLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  // --- Photo Handling ---
  onFilesSelected(event: any) {
    const files: FileList = event.target.files;
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);
    const availableSlots = 5 - (this.selectedFiles.length + this.existingImageUrls.length);
    if (newFiles.length > availableSlots) {
      this.error = 'Maximum 5 images allowed.';
      this.pendingFilesToCrop = newFiles.slice(0, availableSlots);
    } else {
      this.pendingFilesToCrop = newFiles;
    }
    if (this.pendingFilesToCrop.length > 0) this.processNextFileForCropping();
    event.target.value = '';
  }

  processNextFileForCropping() {
    if (this.pendingFilesToCrop.length === 0) {
      this.imageFile = null;
      return;
    }
    const fileToCrop = this.pendingFilesToCrop.shift()!;
    this.currentProcessingFileName = fileToCrop.name;
    this.imageFile = fileToCrop;
  }

  onImageCropped(event: CroppedEvent) {
    const ext = this.currentProcessingFileName.split('.').pop() || 'jpg';
    const baseName = this.currentProcessingFileName.substring(0, this.currentProcessingFileName.lastIndexOf('.'));
    const file = new File([event.blob], `${baseName}_cropped.${ext}`, { type: 'image/jpeg' });
    this.selectedFiles.push(file);
    this.filePreviewUrls.push(event.objectUrl);
    this.imageFile = null;
    this.processNextFileForCropping();
  }

  cancelCrop() {
    this.imageFile = null;
    this.processNextFileForCropping();
  }

  removeFile(index: number) {
    this.selectedFiles.splice(index, 1);
    URL.revokeObjectURL(this.filePreviewUrls[index]);
    this.filePreviewUrls.splice(index, 1);
  }

  removeExistingFile(index: number) {
    this.existingImageUrls.splice(index, 1);
  }

  getImageUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const baseUrl = environment.apiUrl.replace('/api', '');
    return `${baseUrl}${path}`;
  }

  // --- Location Suggestions ---
  onLocationInput(query: string) { this.locationSearch$.next(query); }
  selectLocation(suggestion: LocationSuggestion) {
    this.location = suggestion.displayName;
    this.locationSuggestions = [];
    this.cdr.detectChanges();
  }
  isValidMapsUrl(url: string): boolean { return url.startsWith('http'); }

  // --- Input Validation ---
  enforceNumeric(event: Event) {
    const input = event.target as HTMLInputElement;
    input.value = input.value.replace(/[^0-9]/g, '');
    this.maxTickets = input.value ? parseInt(input.value, 10) : null;
  }

  enforceDecimal(event: Event) {
    const input = event.target as HTMLInputElement;
    let val = input.value.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
    input.value = val;
    if (input.name === 'ticket_price') this.ticketPrice = val ? parseFloat(val) : null;
    else if (input.name === 'vip_price') this.vipPrice = val ? parseFloat(val) : null;
  }

  // --- Seat Map Logic ---
  toggleSeatMap() {
    if (this.ticketsSold > 0) return;
    this.seatMapEnabled = !this.seatMapEnabled;
    this.onSeatMapToggle();
  }

  onSeatMapToggle() {
    if (this.seatMapEnabled) this.recalcTotal();
    else this.totalSeats = 0;
  }

  recalcTotal() {
    const r = this.seatRows ?? 0;
    const c = this.seatColumns ?? 0;
    this.totalSeats = r * c;
    if (this.seatMapEnabled) this.maxTickets = this.totalSeats;
    const pRows = Math.min(r, 5);
    const pCols = Math.min(c, 8);
    this.previewRows = Array.from({ length: pRows }, (_, i) => {
      let n = i;
      let label = '';
      while (n >= 0) {
        label = String.fromCharCode(65 + (n % 26)) + label;
        n = Math.floor(n / 26) - 1;
      }
      return label;
    });
    this.previewCols = Array.from({ length: pCols }, (_, i) => i + 1);
  }

  getMiniStadiumSeatStyle(rowIndex: number, colIndex: number, totalCols: number) {
    const radius = 35 + (rowIndex * 8);
    let angle = 0;
    if (totalCols > 1) {
      const startAngle = -160;
      const step = 320 / (totalCols - 1);
      angle = startAngle + (colIndex * step);
    }
    return { 'transform': `translate(-50%, -50%) rotate(${angle}deg) translateY(${-radius}px)` };
  }

  onSubmit() {
    this.loading = true;
    this.error = '';
    this.success = '';

    const payload: UpdateEventPayload = {
      title: this.title,
      description: this.description,
      location: this.location || undefined,
      event_date: new Date(this.eventDate).toISOString(),
      gate_open_time: new Date(this.gateOpenTime).toISOString(),
      event_end_time: new Date(this.eventEndTime).toISOString(),
      google_maps_url: this.googleMapsUrl || undefined,
      max_tickets: this.maxTickets!,
      ticket_price: this.ticketPrice!,
      vip_price: this.vipPrice!,
      refund_policy: this.refundPolicy,
      status: 'published', // ensure it remains published on update
      image_urls: this.existingImageUrls,
      seat_layout: this.seatMapEnabled ? this.seatLayout : undefined
    };

    this.eventService.updateEvent(this.eventId, payload).subscribe({
      next: (event) => {
        const finalizeUpdate = () => {
          if (this.seatMapEnabled && this.ticketsSold === 0) {
            // Regeneration logic: if seat configuration exists, we might not want to always regenerate 
            // but the user said "organizer can change/update everything".
            this.seatService.generateSeats(this.eventId).subscribe({
              next: () => {
                this.success = 'Event and seats updated successfully!';
                this.loading = false;
                setTimeout(() => this.router.navigate(['/events', this.eventId]), 1500);
                this.cdr.detectChanges();
              },
              error: () => {
                this.success = 'Event updated, but seat generation failed.';
                this.loading = false;
                setTimeout(() => this.router.navigate(['/events', this.eventId]), 2000);
                this.cdr.detectChanges();
              }
            });
          } else {
            this.success = 'Event updated successfully!';
            this.loading = false;
            setTimeout(() => this.router.navigate(['/events', this.eventId]), 1500);
            this.cdr.detectChanges();
          }
        };

        if (this.selectedFiles.length > 0) {
          this.eventService.uploadImages(this.eventId, this.selectedFiles).subscribe({
            next: () => finalizeUpdate(),
            error: (err) => {
              this.error = 'Event updated, but new images failed to upload: ' + (err.error?.message || err.message);
              setTimeout(() => finalizeUpdate(), 2000);
            }
          });
        } else {
          finalizeUpdate();
        }
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to update event.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  cancel() { this.router.navigate(['/events', this.eventId]); }
}
