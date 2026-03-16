import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EventSeat } from '../../core/services/seat.service';
import { ScanEvent } from '../../core/services/event.service';
import { environment } from '../../../environments/environment';
import { PaymentService, RazorpayOrder } from '../../core/services/payment.service';

declare var Razorpay: any;

export interface PaymentDetails {
  baseAmount: number;
  convenienceFee: number;
  totalAmount: number;
  seats: EventSeat[];
  event: ScanEvent;
  lockedUntil: string;
}

@Component({
  selector: 'app-payment-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" (click)="onBackdropClick($event)">
      <div class="modal-card glass-card" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="modal-header">
          <div>
            <h2 style="margin:0;font-size:1.3rem">💳 Complete Payment</h2>
            <p style="color:var(--text-muted);font-size:0.8rem;margin:4px 0 0">Secure Checkout · Seats locked</p>
          </div>
          <div class="countdown-badge" [class.urgent]="timeLeft <= 60">
            ⏳ {{ formatTime(timeLeft) }}
          </div>
        </div>

        <!-- Order Summary -->
        <div class="order-summary">
          <h3 style="font-size:0.9rem;color:var(--text-muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.05em">Order Summary</h3>
          
          <div class="seats-list">
            @for (seat of payment.seats; track seat.id) {
              <div class="seat-item">
                <span>{{ seat.row_label }}{{ seat.seat_number }}
                  @if (seat.row_label === 'A' || seat.row_label === 'B') {
                    <span class="vip-tag">VIP</span>
                  }
                </span>
                <span>₹{{ getSeatPrice(seat) | number:'1.0-0' }}</span>
              </div>
            }
          </div>

          <div class="total-row">
            <span style="color:var(--text-secondary)">Subtotal</span>
            <span>₹{{ payment.baseAmount | number:'1.0-0' }}</span>
          </div>
          <div class="total-row">
            <span style="color:var(--text-secondary)">Convenience Fee (2%)</span>
            <span>₹{{ payment.convenienceFee | number:'1.2-2' }}</span>
          </div>
          <div class="total-row grand-total">
            <span style="font-size:1.1rem;font-weight:700">Total</span>
            <span class="price-highlight">₹{{ payment.totalAmount | number:'1.2-2' }}</span>
          </div>
        </div>

        <!-- Razorpay Section -->
        <div class="payment-section">
          <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:20px;text-align:center">
            Pay securely via Razorpay (Card, Netbanking, Wallet).
          </p>
          
          <button class="btn btn-primary btn-block razorpay-btn" (click)="payWithRazorpay()" [disabled]="processing">
            @if (processing) {
              <span class="spinner" style="width:18px;height:18px;border-width:2px;margin-right:8px"></span>
              {{ statusMessage || 'Processing...' }}
            } @else {
              💳 Pay ₹{{ payment.totalAmount | number:'1.2-2' }} Now
            }
          </button>
          
          <button class="btn btn-secondary btn-block" (click)="onCancel()" [disabled]="processing" style="margin-top:12px">
            Cancel
          </button>
        </div>

        @if (error) {
          <div class="alert alert-danger" style="margin:16px 24px">{{ error }}</div>
        }
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,0.85);
      backdrop-filter: blur(8px); z-index: 1000;
      display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .modal-card {
      width: 100%; max-width: 440px; padding: 0;
      max-height: 95vh; overflow-y: auto;
      border-radius: 20px; animation: fadeIn 0.25s ease;
    }
    .modal-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 24px 24px 16px; border-bottom: 1px solid var(--border-glass);
    }
    .countdown-badge {
      background: rgba(234,179,8,0.15); border: 1px solid rgba(234,179,8,0.4);
      color: #eab308; padding: 6px 14px; border-radius: 20px;
      font-weight: 700; font-size: 1rem; font-family: monospace;
    }
    .countdown-badge.urgent {
      background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.4);
      color: #ef4444; animation: pulse 1s infinite;
    }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.6; } }

    .order-summary {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border-glass);
    }
    .seats-list { margin-bottom: 12px; }
    .seat-item {
      display: flex; justify-content: space-between;
      padding: 6px 0; font-size: 0.9rem; color: var(--text-secondary);
    }
    .vip-tag {
      display: inline-block; background: #7c3aed; color: #fff;
      font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; margin-left: 6px;
      vertical-align: middle;
    }
    .total-row {
      display: flex; justify-content: space-between;
      padding: 6px 0; font-size: 0.9rem;
      border-top: 1px solid rgba(255,255,255,0.04);
    }
    .grand-total { padding-top: 12px; margin-top: 4px; }
    .price-highlight {
      font-size: 1.4rem; font-weight: 700;
      background: var(--accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }

    .payment-section {
      padding: 24px;
    }
    .razorpay-btn { 
      background: linear-gradient(135deg, #339aff, #0070f3);
      height: 48px; font-size: 1rem;
    }
  `]
})
export class PaymentModalComponent implements OnInit, OnDestroy {
  @Input() payment!: PaymentDetails;
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  processing = false;
  statusMessage = '';
  error = '';

  timeLeft = 480;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private paymentService: PaymentService
  ) {}

  ngOnInit() {
    const expiresAt = new Date(this.payment.lockedUntil).getTime();
    this.timer = setInterval(() => {
      this.timeLeft = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      if (this.timeLeft === 0) {
        this.onTimeout();
      }
      this.cdr.markForCheck();
    }, 1000);
    this.timeLeft = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  payWithRazorpay() {
    this.processing = true;
    this.statusMessage = 'Initializing payment...';
    this.error = '';
    this.cdr.markForCheck();

    this.ensureRazorpayLoaded().then(() => {
      this.statusMessage = 'Creating order...';
      this.cdr.markForCheck();

      // Amount in paise
      const amountPaise = Math.round(this.payment.totalAmount * 100);
      const seatIds = this.payment.seats.map(s => s.id);

      this.paymentService.createOrder(amountPaise, this.payment.event.id, seatIds).subscribe({
        next: (order: RazorpayOrder) => {
          this.openRazorpay(order);
        },
        error: (err) => {
          this.processing = false;
          this.error = 'Failed to initialize payment. Please try again.';
          this.cdr.markForCheck();
        }
      });
    }).catch(err => {
      this.processing = false;
      this.error = 'Failed to load Payment Gateway. Please check your internet connection.';
      this.cdr.markForCheck();
    });
  }

  private ensureRazorpayLoaded(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any).Razorpay) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject('Razorpay SDK load failed');
      document.body.appendChild(script);
    });
  }

  private openRazorpay(order: RazorpayOrder) {
    const options = {
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      name: 'ScanTix',
      description: `Tickets for ${this.payment.event.title}`,
      order_id: order.order_id,
      handler: (response: any) => {
        this.verifyPayment(response, order);
      },
      prefill: {
        name: 'Test User',
        email: 'test@example.com',
        contact: '9999999999'
      },
      theme: {
        color: '#339aff'
      },
      modal: {
        ondismiss: () => {
          this.processing = false;
          this.statusMessage = '';
          this.cdr.markForCheck();
        }
      }
    };

    const rzp = new Razorpay(options);
    rzp.open();
  }

  private verifyPayment(rzpResponse: any, order: RazorpayOrder) {
    this.statusMessage = 'Verifying payment...';
    this.cdr.markForCheck();

    const seatIds = this.payment.seats.map(s => s.id);

    this.paymentService.verifyAndBook({
      razorpay_order_id: rzpResponse.razorpay_order_id,
      razorpay_payment_id: rzpResponse.razorpay_payment_id,
      razorpay_signature: rzpResponse.razorpay_signature,
      event_id: order.event_id,
      seat_ids: seatIds.length > 0 ? seatIds : undefined,
      quantity: seatIds.length > 0 ? undefined : this.payment.seats.length // Or fallback if no seats
    }).subscribe({
      next: () => {
        this.statusMessage = 'Payment successful!';
        this.cdr.markForCheck();
        setTimeout(() => this.confirmed.emit(), 1000);
      },
      error: (err) => {
        this.processing = false;
        this.statusMessage = '';
        this.error = 'Payment verification failed. If money was deducted, please contact support.';
        this.cdr.markForCheck();
      }
    });
  }

  getSeatPrice(seat: EventSeat): number {
    const isVip = seat.row_label === 'A' || seat.row_label === 'B';
    if (isVip && this.payment.event.vip_price) {
      return Number(this.payment.event.vip_price);
    }
    return Number(this.payment.event.ticket_price);
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  onCancel() {
    this.cancelled.emit();
  }

  onBackdropClick(event: MouseEvent) {
    // Prevent accidental close
  }

  private onTimeout() {
    if (this.timer) clearInterval(this.timer);
    this.error = '⏰ Payment time expired. Your seats have been released.';
    this.cdr.markForCheck();
    setTimeout(() => this.cancelled.emit(), 3000);
  }
}
