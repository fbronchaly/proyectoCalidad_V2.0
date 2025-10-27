import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
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
  
  // MatTableDataSource para la tabla (mantener para compatibilidad)
  dataSource = new MatTableDataSource<any>([]);
  
  // Array simple para tabla Bootstrap
  tableData: any[] = [];
  
  // Columns for detailed results table
  displayedColumns = ['baseData', 'resultado', 'numeroDePacientes', 'mediaPorPaciente'];
  // Columns for summary table with breakdown by database - CORREGIDO para coincidir con el template
  summaryColumns = ['categoria', 'indicador', 'baseData', 'resultado', 'numeroDePacientes', 'mediaPorPaciente'];

  // Exponer Array.isArray para usar en el template
  Array = Array;

  constructor(
    private router: Router,
    private snack: MatSnackBar,
    public sel: SelectionService,
    private api: ApiService,
    private cdr: ChangeDetectorRef
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

  // Método que se ejecuta cuando se selecciona un rango rápido
  onQuickRangeChange(event: { start: string; end: string }) {
    // Convertir las fechas ISO string a objetos Date
    // Las fechas vienen en formato 'YYYY-MM-DD' (primer día del mes)
    this.startDate = new Date(event.start);
    
    // Para la fecha fin, como el selector usa el primer día del mes siguiente (exclusivo),
    // restamos un día para obtener el último día del mes anterior
    const endDateTemp = new Date(event.end);
    endDateTemp.setDate(endDateTemp.getDate() - 1);
    this.endDate = endDateTemp;
    
    // Actualizar en el servicio
    this.updateDatesInService();
    
    // Mostrar notificación
    this.snack.open(
      `Período seleccionado: ${this.startDate.toLocaleDateString('es-ES')} - ${this.endDate.toLocaleDateString('es-ES')}`,
      'OK',
      { duration: 2500 }
    );
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
    // 1. Detener cualquier proceso en curso localmente
    this.loading = false;
    
    // 2. Limpiar fechas locales
    this.startDate = null;
    this.endDate = null;
    
    // 3. Limpiar datos recibidos de la API
    this.apiResponse = null;
    
    // 4. Llamar al reset completo del servicio (limpia fechas, bases de datos e indicadores)
    this.sel.resetAll();
    
    // 5. Llamar al endpoint de reset del backend para detener procesos y limpiar archivos
    this.api.reset().subscribe({
      next: (response) => {
        // 6. Confirmar que el sistema está listo para nuevos análisis
        this.prepararParaNuevoAnalisis();
        
        this.snack.open('Sistema reiniciado completamente', 'OK', { 
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      },
      error: (error) => {
        // Aunque haya error en el backend, el frontend ya está limpio
        this.prepararParaNuevoAnalisis();
        
        this.snack.open('Frontend reiniciado (advertencia: error en backend)', 'OK', { 
          duration: 3500,
          panelClass: ['warning-snackbar']
        });
      }
    });
  }
  
  // Método para preparar el sistema para un nuevo análisis
  private prepararParaNuevoAnalisis() {
    // Resetear todas las variables de estado locales
    this.loading = false;
    this.apiResponse = null;
    
    // Validar que todo está limpio
    const fechasLimpias = !this.startDate && !this.endDate;
    const basesLimpias = this.sel.getDatabases().length === 0;
    const indicadoresLimpios = this.sel.getIndicators().length === 0;
    
    if (!fechasLimpias || !basesLimpias || !indicadoresLimpios) {
      console.warn('⚠️ Algunos elementos no se limpiaron correctamente:', {
        fechasLimpias,
        basesLimpias,
        indicadoresLimpios
      });
    }
  }

  goToBases() { this.router.navigate(['/bases']); }
  goToIndicadores() { this.router.navigate(['/indicadores']); }

  get readyToSendFront(): boolean {
    const j = this.sel.toJSON();
    return !!j.intervalo && j.baseDatos.length > 0 && j.indices.length > 0;
  }

  // Método para actualizar la tabla
  private updateTableData(): void {
    console.log('=== updateTableData llamado ===');
    console.log('apiResponse:', this.apiResponse);
    
    if (!this.apiResponse?.resultados) {
      console.log('No hay resultados, limpiando tabla');
      this.dataSource.data = [];
      this.tableData = [];
      this.cdr.detectChanges();
      return;
    }

    const tableData: any[] = [];
    
    this.apiResponse.resultados.forEach((indicador) => {
      console.log('Procesando indicador:', indicador.indicador);
      console.log('Resultados del indicador:', indicador.resultados);
      
      if (indicador.resultados) {
        indicador.resultados.forEach((resultado) => {
          tableData.push({
            id_code: indicador.id_code,
            categoria: indicador.categoria,
            indicador: indicador.indicador,
            baseData: resultado.baseData,
            resultado: resultado.resultado,
            numeroDePacientes: resultado.numeroDePacientes,
            indicadorCompleto: indicador
          });
        });
      }
    });
    
    console.log('tableData generado:', tableData);
    console.log('Número de filas:', tableData.length);
    
    this.dataSource.data = tableData;
    this.tableData = tableData;
    this.cdr.detectChanges();
    
    console.log('Tabla actualizada. tableData.length:', this.tableData.length);
  }

  sendToBack() {
    const payload = this.sel.toJSON();
    
    console.log('=== ENVIANDO PETICIÓN AL BACKEND ===');
    console.log('Payload enviado:', payload);
    
    if (!this.readyToSendFront || !payload.intervalo) {
      this.snack.open('Completa rango, bases e indicadores', 'OK', { duration: 2500 });
      return;
    }
    
    // Marcar como iniciando el proceso
    this.loading = true;
    this.apiResponse = null;
    
    this.api.upload(payload).subscribe({
      next: (resp: ApiResponse) => {
        console.log('=== RESPUESTA RECIBIDA DEL BACKEND ===');
        console.log('Respuesta completa:', resp);
        console.log('Success:', resp.success);
        console.log('Message:', resp.message);
        console.log('Timestamp:', resp.timestamp);
        console.log('Número de indicadores:', resp.resultados?.length || 0);
        
        if (resp.resultados && resp.resultados.length > 0) {
          console.log('=== DETALLE DE INDICADORES RECIBIDOS ===');
          resp.resultados.forEach((indicador, index) => {
            console.log(`\n--- Indicador ${index + 1} ---`);
            console.log('ID:', indicador.id_code);
            console.log('Categoría:', indicador.categoria);
            console.log('Indicador:', indicador.indicador);
            console.log('Resultados por BD:', indicador.resultados);
            console.log('Totales:', indicador.totales);
          });
        }
        
        // Guardar los resultados
        this.apiResponse = resp;
        this.loading = false;
        
        // Actualizar la tabla inmediatamente después de recibir datos
        this.updateTableData();
        
        if (resp.success) {
          this.snack.open(
            resp.message || 'Análisis completado - Sistema listo para nuevo trabajo', 
            'OK', 
            { duration: 3000 }
          );
        } else {
          this.snack.open('Error: ' + resp.message, 'OK', { duration: 3500 });
        }
      },
      error: (err) => {
        console.error('=== ERROR EN LA PETICIÓN ===');
        console.error('Error completo:', err);
        console.error('Status:', err.status);
        console.error('Message:', err.message);
        console.error('Error del servidor:', err.error);
        
        this.loading = false;
        this.apiResponse = null;
        this.dataSource.data = [];
        this.tableData = [];
        
        this.snack.open('Error al enviar datos: ' + (err?.error?.message || err?.message || 'desconocido'), 'OK', { duration: 3500 });
      }
    });
  }

  // Método para expandir/colapsar detalles de un indicador
  toggleDetails(indicador: IndicadorResultado) {
    // Implementaremos la lógica de expansión si es necesario
  }

  // Métodos auxiliares para formateo seguro de números
  formatNumber(value: any, decimals: number = 2): string {
    if (value === null || value === undefined || isNaN(value)) {
      return decimals > 0 ? '0.00' : '0';
    }
    return Number(value).toFixed(decimals);
  }

  formatInteger(value: any): string {
    if (value === null || value === undefined || isNaN(value)) {
      return '0';
    }
    return Math.round(Number(value)).toString();
  }

  calculateAverage(resultado: any, pacientes: any): string {
    if (resultado == null || pacientes == null || isNaN(resultado) || isNaN(pacientes) || Number(pacientes) === 0) {
      return '0.00';
    }
    return (Number(resultado) / Number(pacientes)).toFixed(2);
  }

  // Método para formatear fechas de forma segura
  formatDate(date: any, format: string = 'dd/MM/yyyy'): string {
    if (!date) return 'N/A';
    
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return 'N/A';
      
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      
      if (format === 'dd/MM/yyyy HH:mm') {
        return `${day}/${month}/${year} ${hours}:${minutes}`;
      }
      return `${day}/${month}/${year}`;
    } catch (error) {
      return 'N/A';
    }
  }
}
