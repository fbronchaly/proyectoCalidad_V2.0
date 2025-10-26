import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { UploadPayload } from './selection.service';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = 'http://localhost:3000/api';
  private endpoint = `${this.baseUrl}/upload`;

  constructor(private http: HttpClient) {}

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
}
