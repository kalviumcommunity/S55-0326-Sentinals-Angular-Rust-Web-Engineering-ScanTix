import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'events',
        pathMatch: 'full'
    },
    {
        path: 'login',
        loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
    },
    {
        path: 'register',
        loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent)
    },
    {
        path: 'events',
        loadComponent: () => import('./features/events/event-list/event-list.component').then(m => m.EventListComponent)
    },
    {
        path: 'events/create',
        loadComponent: () => import('./features/events/event-create/event-create.component').then(m => m.EventCreateComponent),
        canActivate: [authGuard]
    },
    {
        path: 'events/:id',
        loadComponent: () => import('./features/events/event-detail/event-detail.component').then(m => m.EventDetailComponent)
    },
    {
        path: 'my-events',
        loadComponent: () => import('./features/events/my-events/my-events.component').then(m => m.MyEventsComponent),
        canActivate: [authGuard]
    },
    {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
        canActivate: [authGuard]
    },
    {
        path: 'my-tickets',
        loadComponent: () => import('./features/tickets/my-tickets/my-tickets.component').then(m => m.MyTicketsComponent),
        canActivate: [authGuard]
    },
    {
        path: 'scanner',
        loadComponent: () => import('./features/scanner/qr-scanner/qr-scanner.component').then(m => m.QrScannerComponent),
        canActivate: [authGuard]
    },
    {
        path: 'analytics/:id',
        loadComponent: () => import('./features/analytics/sales-dashboard/sales-dashboard.component').then(m => m.SalesDashboardComponent),
        canActivate: [authGuard]
    },
    {
        path: 'staff',
        loadComponent: () => import('./features/staff/staff-dashboard/staff-dashboard.component').then(m => m.StaffDashboardComponent),
        canActivate: [authGuard]
    },
    {
        path: 'staff/scan/:eventId',
        loadComponent: () => import('./features/staff/scanner/scanner.component').then(m => m.StaffScannerComponent),
        canActivate: [authGuard]
    },
    {
        path: '**',
        redirectTo: 'events'
    }
];
