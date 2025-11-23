import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { UploadPayload } from './selection.service';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment'; // Agregar import de environment

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = `${environment.apiUrl}/api`; // Usar environment.apiUrl
  private endpoint = `${this.baseUrl}/upload`; // Cambiar de /consulta a /upload
  private socket: Socket;

  constructor(private http: HttpClient) {
    // Usar environment.apiUrl para WebSocket también
    const socketUrl = environment.apiUrl;
    console.log('🔌 Conectando WebSocket a:', socketUrl);
    
    // Inicializar conexión WebSocket con configuración específica
    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true
    });
    
    // Agregar listeners para diagnosticar conexión
    this.socket.on('connect', () => {
      console.log('✅ WebSocket conectado exitosamente');
      console.log('🆔 Socket ID:', this.socket.id);
    });
    
    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket desconectado. Razón:', reason);
    });
    
    this.socket.on('connect_error', (error) => {
      console.error('🚫 Error de conexión WebSocket:', error);
      console.log('🔄 Reintentando conexión...');
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 WebSocket reconectado después de', attemptNumber, 'intentos');
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('❌ Error al reconectar WebSocket:', error);
    });
  }

  upload(payload: UploadPayload): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    return this.http.post(this.endpoint, payload, { headers }).pipe(
      catchError((err) => {
        console.error('Error en upload:', err);
        console.error('Status:', err.status);
        console.error('URL:', err.url);
        return throwError(() => new Error(err?.message || 'Error de red'));
      })
    );
  }

  reset(): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    return this.http.post(`${this.baseUrl}/reset`, {}, { headers }).pipe(
      catchError((err) => {
        console.error('Error en reset:', err);
        console.error('Status:', err.status);
        console.error('URL:', err.url);
        return throwError(() => new Error(err?.message || 'Error de red en reset'));
      })
    );
  }

  // NUEVO: Método para recibir actualizaciones de progreso
  getProgressUpdates(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('progreso', (data) => {
        observer.next(data);
      });
      
      // Cleanup al desuscribirse
      return () => {
        this.socket.off('progreso');
      };
    });
  }

  // NUEVO: Método para recibir notificaciones de servidor reseteado
  getServerResetUpdates(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('servidor-reseteado', (data) => {
        observer.next(data);
      });
      
      return () => {
        this.socket.off('servidor-reseteado');
      };
    });
  }

  // NUEVO: Método para desconectar WebSocket
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
