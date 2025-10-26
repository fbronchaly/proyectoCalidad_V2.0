import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): boolean {
    const logged = this.auth.isLoggedIn();
    console.log('🔐 Guard ejecutado. ¿Está logueado?', logged);
    if (!logged) this.router.navigate(['/login']);
    return logged;

  }
}
