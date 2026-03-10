import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="auth-page">
      <div class="auth-card glass-card animate-fadeIn">
        <div class="auth-header">
          <span class="auth-icon">🎫</span>
          <h1 class="gradient-text">Welcome Back</h1>
          <p>Sign in to your ScanTix account</p>
        </div>

        @if (error) {
          <div class="alert alert-danger">{{ error }}</div>
        }

        <form (ngSubmit)="onSubmit()" class="auth-form">
          <div class="form-group">
            <label for="email">Email Address</label>
            <input id="email" type="email" class="form-control"
                   [(ngModel)]="email" name="email"
                   placeholder="you@example.com" required>
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input id="password" type="password" class="form-control"
                   [(ngModel)]="password" name="password"
                   placeholder="••••••••" required>
          </div>

          <button type="submit" class="btn btn-primary btn-lg" style="width:100%" [disabled]="loading">
            @if (loading) {
              <span class="spinner" style="width:20px;height:20px;border-width:2px"></span>
            } @else {
              Sign In
            }
          </button>
        </form>

        <p class="auth-footer">
          Don't have an account? <a routerLink="/register">Sign up</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .auth-card {
      width: 100%;
      max-width: 440px;
      padding: 48px 40px;
    }

    .auth-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .auth-icon {
      font-size: 3rem;
      display: block;
      margin-bottom: 16px;
    }

    .auth-header h1 {
      font-size: 1.8rem;
      margin-bottom: 8px;
    }

    .auth-header p {
      color: var(--text-secondary);
    }

    .auth-form {
      margin-bottom: 24px;
    }

    .auth-footer {
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.9rem;
    }
  `]
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';
  loading = false;

  constructor(private auth: AuthService, private router: Router) { }

  onSubmit() {
    this.loading = true;
    this.error = '';

    this.auth.login(this.email, this.password).pipe(
      finalize(() => this.loading = false)
    ).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.error = err.error?.message
          || err.message
          || `Login failed (${err.status}). Check your credentials.`;
      }
    });
  }
}
