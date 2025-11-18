import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-first-day-range-picker',
  templateUrl: './first-day-range-picker.component.html',
  styleUrls: ['./first-day-range-picker.component.css']
})
export class FirstDayRangePickerComponent {
  @Input() minYear = 2018;
  @Input() maxYear = new Date().getFullYear() + 1;
  @Output() rangeChange = new EventEmitter<{ start: string; end: string }>();

  months = [
    { value: 1, label: 'Enero' }, { value: 2, label: 'Febrero' }, { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' }, { value: 5, label: 'Mayo' }, { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' }, { value: 8, label: 'Agosto' }, { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' }, { value: 11, label: 'Noviembre' }, { value: 12, label: 'Diciembre' }
  ];

  years: number[] = [];

  startMonth = 1;
  startYear = new Date().getFullYear();
  endMonth = 1;
  endYear = new Date().getFullYear();

  // Propiedades para el límite máximo (un día antes de hoy)
  private maxAllowedDate: Date;
  maxAllowedYear: number;
  maxAllowedMonth: number;

  constructor() {
    // Calcular la fecha máxima permitida (un día antes de hoy)
    const today = new Date();
    this.maxAllowedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    this.maxAllowedYear = this.maxAllowedDate.getFullYear();
    this.maxAllowedMonth = this.maxAllowedDate.getMonth() + 1;

    // Limitar los años disponibles hasta el año máximo permitido
    for (let y = this.maxAllowedYear; y >= this.minYear; y--) this.years.push(y);
    
    // Inicializar con valores seguros
    this.endYear = this.maxAllowedYear;
    this.endMonth = this.maxAllowedMonth;
    
    this.presetYTD();
  }

  private iso(y: number, m: number): string {
    const mm = String(m).padStart(2, '0');
    return `${y}-${mm}-01`;
  }
  private toDate(y: number, m: number) { return new Date(y, m - 1, 1); }

  isValid(): boolean {
    const s = this.toDate(this.startYear, this.startMonth);
    const e = this.toDate(this.endYear, this.endMonth);
    
    // Validar que el fin sea posterior al inicio
    if (e.getTime() <= s.getTime()) return false;
    
    // Validar que el año/mes de fin no exceda el límite máximo
    if (this.endYear > this.maxAllowedYear) return false;
    if (this.endYear === this.maxAllowedYear && this.endMonth > this.maxAllowedMonth) return false;
    
    return true;
  }

  // Obtener años válidos para la fecha fin
  getValidEndYears(): number[] {
    return this.years; // Ya están filtrados en el constructor
  }

  // Obtener meses válidos para la fecha fin según el año seleccionado
  getValidEndMonths(): typeof this.months {
    if (this.endYear < this.maxAllowedYear) {
      return this.months; // Todos los meses son válidos si el año es anterior al máximo
    } else if (this.endYear === this.maxAllowedYear) {
      return this.months.filter(month => month.value <= this.maxAllowedMonth);
    } else {
      return []; // No hay meses válidos si el año es posterior al máximo
    }
  }

  // Validar y corregir la fecha fin si excede el límite
  onEndYearChange() {
    const validMonths = this.getValidEndMonths();
    if (validMonths.length === 0) {
      // Si no hay meses válidos, resetear al máximo permitido
      this.endYear = this.maxAllowedYear;
      this.endMonth = this.maxAllowedMonth;
    } else if (!validMonths.some(m => m.value === this.endMonth)) {
      // Si el mes actual no es válido, seleccionar el último mes válido
      this.endMonth = validMonths[validMonths.length - 1].value;
    }
    this.emitIfValid();
  }

  onEndMonthChange() {
    this.emitIfValid();
  }

  emitIfValid() {
    if (!this.isValid()) return;
    this.rangeChange.emit({
      start: this.iso(this.startYear, this.startMonth),
      end:   this.iso(this.endYear,   this.endMonth)
    });
  }

  reset() { this.presetYTD(); }

  // Atajos
  presetLast3Months() {
    const now = new Date();
    // Calcular 3 meses atrás desde el mes actual
    const startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1); // 2 meses atrás para incluir 3 meses
    this.startYear = startDate.getFullYear(); 
    this.startMonth = startDate.getMonth() + 1;
    
    // La fecha fin debe ser el mes actual limitado por maxAllowed
    this.endYear = this.maxAllowedYear;
    this.endMonth = this.maxAllowedMonth;
    
    this.emitIfValid();
  }
  
  presetYTD() {
    const now = new Date();
    this.startYear = now.getFullYear(); 
    this.startMonth = 1; // Enero
    
    // La fecha fin debe ser el mes actual, no el siguiente
    this.endYear = this.maxAllowedYear;
    this.endMonth = this.maxAllowedMonth;
    
    this.emitIfValid();
  }
  
  presetLastYear() {
    const y = new Date().getFullYear() - 1;
    this.startYear = y; 
    this.startMonth = 1;
    
    // La fecha fin para el año anterior debería ser enero del año actual
    // Pero debe respetar el límite máximo
    const proposedEndYear = y + 1;
    const proposedEndMonth = 1;
    
    if (proposedEndYear < this.maxAllowedYear || 
        (proposedEndYear === this.maxAllowedYear && proposedEndMonth <= this.maxAllowedMonth)) {
      this.endYear = proposedEndYear;
      this.endMonth = proposedEndMonth;
    } else {
      this.endYear = this.maxAllowedYear;
      this.endMonth = this.maxAllowedMonth;
    }
    
    this.emitIfValid();
  }
}
