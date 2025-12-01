import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, Subject, BehaviorSubject } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { UploadPayload } from './selection.service';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = `${environment.apiUrl}/api`;
  private endpoint = `${this.baseUrl}/upload`;
  private socket!: Socket; // CORREGIDO: Usar ! para indicar que se inicializará
  private connectionStatus = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient) {
    this.initializeWebSocket();
  }

  // CORREGIDO: Inicialización más robusta del WebSocket
  private initializeWebSocket(): void {
    // PRODUCCIÓN: Same-origin optimizado
    const socketUrl = environment.production ? '' : environment.apiUrl;
    console.log('🔌 Conectando WebSocket a:', socketUrl || 'same-origin');
    
    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      timeout: 60000, // CORREGIDO: Aumentado a 60 segundos para producción
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 5000, // CORREGIDO: 5 segundos para producción
      reconnectionAttempts: 20, // CORREGIDO: Más intentos para producción
      autoConnect: true,
      upgrade: true,
      rememberUpgrade: false,
      // PRODUCCIÓN: Configuración optimizada para same-origin
      withCredentials: false, // No necesario en same-origin
      // Eliminado extraHeaders innecesarios para same-origin
    });
    
    // Eventos de conexión mejorados
    this.socket.on('connect', () => {
      console.log('✅ WebSocket conectado exitosamente');
      console.log('🆔 Socket ID:', this.socket.id);
      console.log('🌐 URL:', socketUrl);
      console.log('🚀 Transporte:', this.socket.io.engine.transport.name);
      this.connectionStatus.next(true);
    });
    
    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket desconectado. Razón:', reason);
      this.connectionStatus.next(false);
      
      // CORREGIDO: Reconectar automáticamente en más casos
      if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'transport error') {
        console.log('🔄 Reconectando automáticamente...');
        setTimeout(() => {
          if (!this.socket.connected) {
            this.socket.connect();
          }
        }, 2000);
      }
    });
    
    this.socket.on('connect_error', (error: any) => {
      console.error('🚫 Error de conexión WebSocket:', error);
      console.log('📋 Detalles del error:', {
        message: error.message || 'Error desconocido',
        description: error.description || 'Sin descripción',
        context: error.context || 'Sin contexto',
        type: error.type || 'Error genérico'
      });
      this.connectionStatus.next(false);
      
      // CORREGIDO: Intentar reconexión manual después de error con más tiempo
      setTimeout(() => {
        if (!this.socket.connected) {
          console.log('🔄 Reintentando conexión después de error...');
          this.socket.connect();
        }
      }, 5000); // CORREGIDO: Aumentado a 5 segundos
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 WebSocket reconectado después de', attemptNumber, 'intentos');
      this.connectionStatus.next(true);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('❌ Error al reconectar WebSocket:', error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('💥 Falló completamente la reconexión WebSocket');
      this.connectionStatus.next(false);
      
      // NUEVO: Último intento manual después de fallo total
      console.log('🔄 Último intento manual de reconexión...');
      setTimeout(() => {
        this.reconnect();
      }, 10000);
    });

    // Evento específico para debugging
    this.socket.onAny((event, ...args) => {
      console.log('📨 Evento WebSocket recibido:', event, args);
    });
  }

  // NUEVO: Getter para el estado de conexión
  get isConnected(): Observable<boolean> {
    return this.connectionStatus.asObservable();
  }

  // NUEVO: Método para verificar conexión
  checkConnection(): boolean {
    return this.socket && this.socket.connected;
  }

  upload(payload: UploadPayload): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    console.log('📤 Enviando payload:', payload);
    console.log('🔗 URL endpoint:', this.endpoint);

    return this.http.post(this.endpoint, payload, { headers }).pipe(
      catchError((err) => {
        console.error('❌ Error en upload:', err);
        console.error('📊 Status:', err.status);
        console.error('🌐 URL:', err.url);
        console.error('📝 Message:', err.message);
        console.error('📋 Error completo:', JSON.stringify(err, null, 2));
        return throwError(() => new Error(err?.error?.message || err?.message || 'Error de red'));
      })
    );
  }

  reset(): Observable<any> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    console.log('🔄 Enviando reset al backend...');

    return this.http.post(`${this.baseUrl}/reset`, {}, { headers }).pipe(
      catchError((err) => {
        console.error('❌ Error en reset:', err);
        console.error('📊 Status:', err.status);
        console.error('🌐 URL:', err.url);
        return throwError(() => new Error(err?.error?.message || err?.message || 'Error de red en reset'));
      })
    );
  }

  // MEJORADO: Método para recibir actualizaciones de progreso con mejor manejo
  getProgressUpdates(): Observable<any> {
    return new Observable((observer) => {
      const progressHandler = (data: any) => {
        console.log('📊 Progreso recibido en ApiService:', data);
        observer.next(data);
      };

      this.socket.on('progreso', progressHandler);
      
      // Verificar si ya estamos conectados
      if (this.socket.connected) {
        console.log('✅ Socket ya conectado, listo para recibir eventos');
      } else {
        console.log('⏳ Socket no conectado aún, esperando conexión...');
        this.socket.on('connect', () => {
          console.log('🔗 Socket conectado, ahora puede recibir eventos de progreso');
        });
      }
      
      return () => {
        console.log('🧹 Limpiando listener de progreso');
        this.socket.off('progreso', progressHandler);
      };
    });
  }

  // MEJORADO: Método para recibir notificaciones de servidor reseteado
  getServerResetUpdates(): Observable<any> {
    return new Observable((observer) => {
      const resetHandler = (data: any) => {
        console.log('🔄 Reset del servidor recibido en ApiService:', data);
        observer.next(data);
      };

      this.socket.on('servidor-reseteado', resetHandler);
      
      return () => {
        console.log('🧹 Limpiando listener de reset');
        this.socket.off('servidor-reseteado', resetHandler);
      };
    });
  }

  // NUEVO: Método para recibir eventos de análisis completado
  getAnalysisCompletedUpdates(): Observable<any> {
    return new Observable((observer) => {
      const completedHandler = (data: any) => {
        console.log('🎯 Análisis completado recibido en ApiService:', data);
        observer.next(data);
      };

      this.socket.on('analisis-completado', completedHandler);
      
      return () => {
        console.log('🧹 Limpiando listener de análisis completado');
        this.socket.off('analisis-completado', completedHandler);
      };
    });
  }

  // MEJORADO: Método para desconectar WebSocket
  disconnect(): void {
    if (this.socket) {
      console.log('🔌 Desconectando WebSocket...');
      this.socket.disconnect();
      this.connectionStatus.next(false);
    }
  }

  // NUEVO: Método para reconectar WebSocket
  reconnect(): void {
    if (this.socket) {
      console.log('🔄 Forzando reconexión WebSocket...');
      this.socket.connect();
    }
  }

  // NUEVO: Método para confirmar recepción de datos al backend
  confirmDataReceived(): void {
    if (this.socket && this.socket.connected) {
      console.log('📤 Confirmando recepción de datos al backend...');
      this.socket.emit('datos-recibidos', { 
        timestamp: new Date().toISOString(),
        message: 'Cliente procesó datos exitosamente'
      });
    } else {
      console.warn('⚠️ No se pudo confirmar recepción: Socket no conectado');
    }
  }

  // NUEVO: Método de debugging para enviar evento de prueba
  sendTestMessage(): void {
    if (this.socket && this.socket.connected) {
      console.log('🧪 Enviando mensaje de prueba...');
      this.socket.emit('test-message', { message: 'Test desde frontend', timestamp: new Date().toISOString() });
    } else {
      console.warn('⚠️ No se puede enviar mensaje de prueba: Socket no conectado');
    }
  }
}
