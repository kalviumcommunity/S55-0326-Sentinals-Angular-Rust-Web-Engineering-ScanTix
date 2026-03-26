import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="navbar">
      <div class="navbar-inner">
        @if (isScannerRoute()) {
          <div class="logo">
            <span class="logo-icon">🎫</span>
            <span class="logo-text gradient-text">ScanTix</span>
          </div>
        } @else {
          <a routerLink="/" class="logo">
            <span class="logo-icon">🎫</span>
            <span class="logo-text gradient-text">ScanTix</span>
          </a>
        }

        <div class="nav-links" [class.centered]="isScannerRoute()">
          @if (isScannerRoute()) {
            <span class="nav-scanner-text">
              <span class="scanner-icon">📷</span>
              <span class="scanner-label">Scanner</span>
            </span>
          } @else {
            <a routerLink="/events" routerLinkActive="active">Events</a>
            @if (auth.isAuthenticated) {
              @if (auth.isOrganizer) {
                <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
                <a routerLink="/my-events" routerLinkActive="active">My Events</a>
                <a routerLink="/events/create" routerLinkActive="active">+ Create</a>
                <a routerLink="/organizer/bank-details" routerLinkActive="active">🏦 Bank</a>
              } @else {
                <a routerLink="/my-tickets" routerLinkActive="active">My Tickets</a>
              }
              @if (auth.role === 'staff' || auth.role === 'scanner') {
                <a routerLink="/scanner" routerLinkActive="active">📷 Scanner</a>
              }
            }
          }
        </div>

        @if (!isScannerRoute()) {
          <div class="nav-actions">
            @if (auth.isAuthenticated) {
              <div class="user-badge">
                <span class="user-avatar">{{ (auth.currentUser?.full_name || 'U')[0].toUpperCase() }}</span>
                <div class="user-info">
                  <span class="user-name">{{ auth.currentUser?.full_name }}</span>
                  <span class="user-role" [class]="'role-' + auth.role">{{ auth.role }}</span>
                </div>
              </div>
              <button class="btn btn-secondary btn-sm" (click)="auth.logout()">Logout</button>
            } @else {
              <a routerLink="/login" class="btn btn-secondary btn-sm">Login</a>
              <a routerLink="/register" class="btn btn-primary btn-sm">Sign Up</a>
            }
          </div>
        }
      </div>
    </nav>
  `,
  styles: [`
    .navbar {
      position: sticky; top: 0; z-index: 100;
      background: rgba(10, 10, 26, 0.9);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .navbar-inner {
      max-width: 1400px; margin: 0 auto;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 24px; height: 64px;
      position: relative;
    }
    .logo {
      display: flex; align-items: center; gap: 10px;
      font-family: 'Poppins', sans-serif; font-size: 1.4rem;
      font-weight: 700; text-decoration: none;
    }
    .logo-icon { font-size: 1.6rem; }
    .nav-links { display: flex; gap: 4px; }
    .nav-links.centered { position:absolute; left:50%; transform:translateX(-50%); }
    .nav-links a {
      padding: 8px 14px; border-radius: 8px;
      color: var(--text-secondary); font-size: 0.88rem;
      font-weight: 500; transition: all 0.2s ease; text-decoration: none;
    }
    .nav-links a:hover, .nav-links a.active {
      color: var(--text-primary); background: rgba(255, 255, 255, 0.06);
    }
    .nav-actions { display: flex; align-items: center; gap: 12px; }
    .user-badge {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 12px 6px 6px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      transition: all 0.3s ease;
    }
    .user-badge:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(168, 85, 247, 0.2);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), var(--shadow-glow);
    }
    .user-avatar {
      width: 36px; height: 36px; border-radius: 10px;
      background: var(--accent-gradient);
      display: flex; align-items: center; justify-content: center;
      font-size: 1rem; font-weight: 700; color: white; flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .user-info { display: flex; flex-direction: column; gap: 2px; }
    .user-name { font-size: 0.9rem; color: var(--text-primary); font-weight: 600; letter-spacing: -0.2px; }
    .user-role {
      font-size: 0.65rem; font-weight: 800; text-transform: uppercase;
      letter-spacing: 0.8px; padding: 2px 8px; border-radius: 20px;
      width: fit-content;
    }
    .role-organizer { background: rgba(234, 179, 8, 0.15); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.2); }
    .role-admin { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.2); }
    .role-attendee { background: rgba(168, 85, 247, 0.15); color: #a78bfa; border: 1px solid rgba(168, 85, 247, 0.2); }
    .role-staff, .role-scanner { background: rgba(14, 165, 233, 0.15); color: #38bdf8; border: 1px solid rgba(14, 165, 233, 0.2); }
    
    .nav-scanner-text {
      color: var(--accent-primary);
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      gap: 8px;
      line-height: 1;
    }
    .scanner-icon { font-size: 1.25rem; display: flex; align-items: center; justify-content: center; margin-top: -5px; }
    .scanner-label { display: flex; align-items: center; }

    @media (max-width: 768px) {
      .nav-links { display: none; }
      .user-info { display: none; }
    }
  `]
})
export class NavbarComponent {
  constructor(
    public auth: AuthService,
    private router: Router
  ) { }

  isScannerRoute(): boolean {
    const url = this.router.url;
    return url.startsWith('/scanner') || url.startsWith('/scan');
  }
}
