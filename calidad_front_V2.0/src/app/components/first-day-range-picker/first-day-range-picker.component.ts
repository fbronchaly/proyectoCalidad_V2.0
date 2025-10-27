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
  endMonth = new Date().getMonth() + 1;
  endYear = new Date().getFullYear();

  constructor() {
    for (let y = this.maxYear; y >= this.minYear; y--) this.years.push(y);
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
    return e.getTime() > s.getTime();
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
  presetCurrentMonth() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1;
    this.startYear = y; this.startMonth = m;
    const next = new Date(y, m, 1);
    this.endYear = next.getFullYear(); this.endMonth = next.getMonth() + 1;
    this.emitIfValid();
  }
  presetLast3Months() {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const start = new Date(end.getFullYear(), end.getMonth() - 3, 1);
    this.startYear = start.getFullYear(); this.startMonth = start.getMonth() + 1;
    this.endYear = end.getFullYear();     this.endMonth = end.getMonth() + 1;
    this.emitIfValid();
  }
  presetYTD() {
    const now = new Date();
    this.startYear = now.getFullYear(); this.startMonth = 1;
    this.endYear = now.getFullYear();   this.endMonth = now.getMonth() + 2;
    const e = new Date(this.endYear, this.endMonth - 1, 1);
    this.endYear = e.getFullYear(); this.endMonth = e.getMonth() + 1;
    this.emitIfValid();
  }
  presetLastYear() {
    const y = new Date().getFullYear() - 1;
    this.startYear = y; this.startMonth = 1;
    this.endYear = y + 1; this.endMonth = 1;
    this.emitIfValid();
  }
}
