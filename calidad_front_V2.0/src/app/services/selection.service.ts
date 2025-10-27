import { Injectable } from '@angular/core';
import { DatabaseService } from './database.service';

export interface UploadPayload {
  intervalo: [string, string] | null;
  baseDatos: string[];
  indices: string[];
}

@Injectable({ providedIn: 'root' })
export class SelectionService {
  private startDate: Date | null = null;
  private endDate: Date | null = null;
  private databases: string[] = [];
  private indicators: string[] = [];

  constructor(private databaseService: DatabaseService) {}

  setDates(start: Date | null, end: Date | null) {
    this.startDate = start;
    this.endDate = end;
  }
  getDates(): {start: Date | null, end: Date | null} {
    return { start: this.startDate, end: this.endDate };
  }

  setDatabases(db: string[]) { this.databases = [...db]; }
  getDatabases(): string[] { return [...this.databases]; }

  setIndicators(ids: string[]) { this.indicators = [...ids]; }
  getIndicators(): string[] { return [...this.indicators]; }

  toJSON(): UploadPayload {
    const fmt = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const intervalo = (this.startDate && this.endDate) ? [fmt(this.startDate), fmt(this.endDate)] as [string,string] : null;
    
    console.log('=== FORMATEO DE FECHAS ===');
    console.log('Fecha inicio original:', this.startDate);
    console.log('Fecha fin original:', this.endDate);
    console.log('Intervalo formateado:', intervalo);
    
    return {
      intervalo,
      baseDatos: [...this.databases],
      indices: [...this.indicators]
    };
  }

  resetAll() {
    console.log('🔄 === RESET COMPLETO EN SELECTION SERVICE ===');
    
    // Resetear fechas
    this.startDate = null;
    this.endDate = null;
    console.log('✅ Fechas reseteadas');
    
    // Resetear bases de datos (tanto en memoria como localStorage)
    this.databases = [];
    this.databaseService.resetSelection();
    console.log('✅ Bases de datos reseteadas');
    
    // Resetear indicadores
    this.indicators = [];
    console.log('✅ Indicadores reseteados');
    
    console.log('✅ === RESET COMPLETO FINALIZADO ===');
  }
}
