import { Injectable } from '@angular/core';


@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
   
  ) {}

  login() {
    localStorage.setItem('auth', 'true');
  }

  logout() {
    // Limpiar autenticación
    localStorage.removeItem('auth');
    
  
  }

  isLoggedIn(): boolean {
    return localStorage.getItem('auth') === 'true';
  }
}


