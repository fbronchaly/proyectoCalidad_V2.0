import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';

interface ResultadoBase {
  baseData: string;
  resultado: number;
  numeroDePacientes: number;
}

interface IndicadorResultado {
  id_code: string;
  categoria: string;
  indicador: string;
  intervalo: {
    fechaInicio: string;
    fechaFin: string;
  };
  consulta_sql: string;
  bases_datos: string[];
  resultados: ResultadoBase[];
  totales: {
    resultado: number;
    numero_pacientes: number;
  };
}

interface ApiResponse {
  success: boolean;
  message: string;
  resultados: IndicadorResultado[];
  timestamp: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  startDate: Date | null = null;
  endDate: Date | null = null;
  loading = false;
  apiResponse: ApiResponse | null = null;
  
  // Columns for detailed results table
  displayedColumns = ['baseData', 'resultado', 'numeroDePacientes'];
  // Columns for summary table with breakdown by database
  summaryColumns = ['indicador', 'categoria', 'baseData', 'resultado', 'numeroDePacientes'];

  constructor(
    private router: Router,
    private snack: MatSnackBar,
    public sel: SelectionService,
    private api: ApiService
  ) {}

  ngOnInit(): void {
    const { start, end } = this.sel.getDates();
    this.startDate = start;
    this.endDate = end;
  }

  // Método que se ejecuta cuando cambia la fecha de inicio
  onStartDateChange(date: Date | null) {
    this.startDate = date;
    this.updateDatesInService();
  }

  // Método que se ejecuta cuando cambia la fecha de fin
  onEndDateChange(date: Date | null) {
    this.endDate = date;
    this.updateDatesInService();
  }

  // Actualiza las fechas en el servicio automáticamente
  private updateDatesInService() {
    if (this.startDate && this.endDate) {
      if (this.endDate < this.startDate) {
        this.snack.open('La fecha fin debe ser posterior a inicio', 'OK', { duration: 2500 });
        return;
      }
      this.sel.setDates(this.startDate, this.endDate);
    } else {
      this.sel.setDates(this.startDate, this.endDate);
    }
  }

  resetDates() {
    // Limpiar fechas locales
    this.startDate = null;
    this.endDate = null;
    
    // Limpiar datos recibidos de la API
    this.apiResponse = null;
    
    // Llamar al reset completo del servicio (limpia fechas, bases de datos e indicadores)
    this.sel.resetAll();
    
    // Llamar al endpoint de reset del backend para limpiar archivos y procesos
    this.api.reset().subscribe({
      next: (response) => {
        console.log('Reset backend exitoso:', response);
        this.snack.open('Todos los datos han sido reiniciados', 'OK', { duration: 2000 });
      },
      error: (error) => {
        console.error('Error en reset backend:', error);
        this.snack.open('Datos locales reiniciados (error en backend)', 'OK', { duration: 2500 });
      }
    });
  }

  goToBases() { this.router.navigate(['/bases']); }
  goToIndicadores() { this.router.navigate(['/indicadores']); }

  get readyToSendFront(): boolean {
    const j = this.sel.toJSON();
    return !!j.intervalo && j.baseDatos.length > 0 && j.indices.length > 0;
  }

  sendToBack() {
    const payload = this.sel.toJSON();
    console.log('=== DATOS A ENVIAR ===');
    console.log('Payload completo:', payload);
    console.log('Intervalo:', payload.intervalo);
    console.log('BaseDatos:', payload.baseDatos);
    console.log('Indices:', payload.indices);
    console.log('Ready to send?', this.readyToSendFront);
    
    if (!this.readyToSendFront || !payload.intervalo) {
      this.snack.open('Completa rango, bases e indicadores', 'OK', { duration: 2500 });
      return;
    }
    this.loading = true;
    this.apiResponse = null;
    
    this.api.upload(payload).subscribe({
      next: (resp: ApiResponse) => {
        console.log('Respuesta del backend:', resp);
        this.apiResponse = resp;
        this.loading = false;
        if (resp.success) {
          this.snack.open(resp.message || 'Resultados recibidos', 'OK', { duration: 2000 });
        } else {
          this.snack.open('Error: ' + resp.message, 'OK', { duration: 3500 });
        }
      },
      error: (err) => {
        console.error('Error detallado:', err);
        this.loading = false;
        this.apiResponse = null;
        this.snack.open('Error al enviar datos: ' + (err?.error?.message || err?.message || 'desconocido'), 'OK', { duration: 3500 });
      }
    });
  }

  // Método para expandir/colapsar detalles de un indicador
  toggleDetails(indicador: IndicadorResultado) {
    // Implementaremos la lógica de expansión si es necesario
  }

  // Getter para obtener los datos desglosados por base de datos para el resumen
  get resumenDesglosado(): any[] {
    if (!this.apiResponse || !this.apiResponse.success || !this.apiResponse.resultados) {
      return [];
    }

    const desglosado: any[] = [];
    
    this.apiResponse.resultados.forEach(indicador => {
      indicador.resultados.forEach(resultado => {
        desglosado.push({
          id_code: indicador.id_code,
          categoria: indicador.categoria,
          indicador: indicador.indicador,
          baseData: resultado.baseData,
          resultado: resultado.resultado,
          numeroDePacientes: resultado.numeroDePacientes,
          // Datos adicionales para referencia
          indicadorCompleto: indicador
        });
      });
    });

    return desglosado;
  }
}
