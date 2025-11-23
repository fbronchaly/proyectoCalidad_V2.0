import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment'; // Importar environment

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  email = '';
  code = '';
  showCodeInput = false;
  message = '';

  private apiUrl = environment.apiUrl; // Usar environment.apiUrl

  constructor(private http: HttpClient, private router: Router, private authService: AuthService) {}
  ngOnInit(): void {
    console.log('API URL:', environment.apiUrl);
  }
  solicitarCodigo() {
    console.log('Email:', this.email);
    
    // Configuración para solicitudes a redes privadas (compatibilidad con restricciones de Chrome)
    const httpOptions = {
      headers: {
        'Content-Type': 'application/json'
      },
      // @ts-ignore - Para compatibilidad con nuevas restricciones de Chrome para redes privadas
      targetAddressSpace: 'private'
    };
    
    this.http.post(`${this.apiUrl}/api/send-code`, { email: this.email }, httpOptions).subscribe({
      next: () => {
        this.message = 'Código enviado a Telegram';
        this.showCodeInput = true;
      },
      error: err => {
        this.message = err.error.message || 'Error al enviar código';
      }
    });
  }

  verificarCodigo() {
    console.log('Código:', this.code);
    console.log('Email:', this.email);
    
    // Configuración para solicitudes a redes privadas (compatibilidad con restricciones de Chrome)
    const httpOptions = {
      headers: {
        'Content-Type': 'application/json'
      },
      // @ts-ignore - Para compatibilidad con nuevas restricciones de Chrome para redes privadas
      targetAddressSpace: 'private'
    };
    
    this.http.post(`${this.apiUrl}/api/verify-code`, { email: this.email, code: this.code }, httpOptions).subscribe({
      next: (res: any) => {
        if (res.message === 'Autenticado') {
          this.authService.login();
          this.router.navigate(['/dashboard']);
        }
      },
      error: err => {
        console.log('Error:', err);
        this.message = err.error.message || 'Código incorrecto o caducado';
      }
    });
  }
}
