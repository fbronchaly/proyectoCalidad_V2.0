import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface MongoIndicador {
  id_code: string;
  categoria: string;
  indicador: string;
  unidad: string;
  fuente: 'mongodb' | 'firebird';
  template: any;
}

export interface MongoQueryPayload {
  centro?: string; // OPCIONAL: nombre del centro MongoDB
  dbIds?: string[]; // OPCIONAL: IDs de bases de datos Firebird (DB1, DB2, etc)
  fechaIni: string;
  fechaFin: string;
  indicadores: string[]; // Array de id_code de indicadores MongoDB
}

export interface MongoQueryResult {
  id_code: string;
  resultado: number;
  numero_pacientes: number;
  numerador?: number;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class MongodbService {
  private baseUrl = `${environment.apiUrl}/api`;

  constructor(private http: HttpClient) {}

  /**
   * Obtener la lista de indicadores MongoDB disponibles
   */
  getMongoIndicadores(): Observable<MongoIndicador[]> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    return this.http.get<MongoIndicador[]>(`${this.baseUrl}/indicadores/mongodb`, { headers }).pipe(
      catchError((err) => {
        console.error('❌ Error obteniendo indicadores MongoDB:', err);
        return throwError(() => new Error(err?.error?.message || err?.message || 'Error obteniendo indicadores MongoDB'));
      })
    );
  }

  /**
   * Ejecutar consultas MongoDB para múltiples indicadores
   */
  executeMongoQueries(payload: MongoQueryPayload): Observable<MongoQueryResult[]> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    console.log('📤 Ejecutando consultas MongoDB:', payload);

    return this.http.post<MongoQueryResult[]>(`${this.baseUrl}/indicadores/mongodb/execute`, payload, { headers }).pipe(
      catchError((err) => {
        console.error('❌ Error ejecutando consultas MongoDB:', err);
        return throwError(() => new Error(err?.error?.message || err?.message || 'Error ejecutando consultas MongoDB'));
      })
    );
  }

  /**
   * Ejecutar una sola consulta MongoDB
   */
  executeMongoQuery(centro: string, fechaIni: string, fechaFin: string, indicadorId: string): Observable<MongoQueryResult> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    const payload = {
      centro,
      fechaIni,
      fechaFin,
      indicadorId
    };

    console.log('📤 Ejecutando consulta MongoDB individual:', payload);

    return this.http.post<MongoQueryResult>(`${this.baseUrl}/indicadores/mongodb/execute-single`, payload, { headers }).pipe(
      catchError((err) => {
        console.error('❌ Error ejecutando consulta MongoDB:', err);
        return throwError(() => new Error(err?.error?.message || err?.message || 'Error ejecutando consulta MongoDB'));
      })
    );
  }

  /**
   * Obtener centros disponibles en MongoDB
   */
  getCentrosDisponibles(): Observable<string[]> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    return this.http.get<string[]>(`${this.baseUrl}/mongodb/centros`, { headers }).pipe(
      catchError((err) => {
        console.error('❌ Error obteniendo centros de MongoDB:', err);
        return throwError(() => new Error(err?.error?.message || err?.message || 'Error obteniendo centros'));
      })
    );
  }

  /**
   * Verificar si un centro tiene datos en MongoDB
   */
  checkCentroData(centro: string): Observable<{ hasData: boolean; testCount: number }> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });

    return this.http.get<{ hasData: boolean; testCount: number }>(
      `${this.baseUrl}/mongodb/centro/${centro}/check`, 
      { headers }
    ).pipe(
      catchError((err) => {
        console.error('❌ Error verificando datos del centro:', err);
        return throwError(() => new Error(err?.error?.message || err?.message || 'Error verificando datos'));
      })
    );
  }
}
