import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

@Component({
  selector: 'app-registro',
  templateUrl: './registro.component.html',
  styleUrls: ['./registro.component.scss']
})
export class RegistroComponent {
  email = '';
  password = '';
  telefono = '';
  mensaje = '';

  constructor(private http: HttpClient, private router: Router) {}

  registrar() {
    this.http.post('http://localhost:3000/api/auth/registrar-operador', {
      email: this.email,
      password: this.password,
      telefono: this.telefono
    }).subscribe({
      next: () => {
        this.mensaje = '✅ Operador registrado correctamente';
        setTimeout(() => this.router.navigate(['/login']), 1500);
      },
      error: () => {
        this.mensaje = '❌ Error al registrar operador';
      }
    });
  }
}

