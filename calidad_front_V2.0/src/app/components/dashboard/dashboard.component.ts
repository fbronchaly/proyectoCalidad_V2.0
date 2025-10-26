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

  // Exponer Array.isArray para usar en el template
  Array = Array;

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
    console.log('=== INICIANDO RESET COMPLETO ===');
    
    // 1. Detener cualquier proceso en curso localmente
    this.loading = false;
    
    // 2. Limpiar fechas locales
    this.startDate = null;
    this.endDate = null;
    
    // 3. Limpiar datos recibidos de la API
    this.apiResponse = null;
    
    // 4. Llamar al reset completo del servicio (limpia fechas, bases de datos e indicadores)
    this.sel.resetAll();
    
    console.log('Estado local reseteado, enviando señal al servidor...');
    
    // 5. Llamar al endpoint de reset del backend para detener procesos y limpiar archivos
    this.api.reset().subscribe({
      next: (response) => {
        console.log('=== RESET BACKEND EXITOSO ===');
        console.log('Respuesta del servidor:', response);
        
        // 6. Confirmar que el sistema está listo para nuevos análisis
        this.prepararParaNuevoAnalisis();
        
        this.snack.open('Sistema reiniciado completamente', 'OK', { 
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      },
      error: (error) => {
        console.error('=== ERROR EN RESET BACKEND ===');
        console.error('Error completo:', error);
        
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
    console.log('=== PREPARANDO PARA NUEVO ANÁLISIS ===');
    
    // Resetear todas las variables de estado locales
    this.loading = false;
    this.apiResponse = null;
    
    // Confirmar que los servicios están listos
    const estado = this.sel.toJSON();
    console.log('Estado después del reset:', estado);
    
    // Validar que todo está limpio
    const fechasLimpias = !this.startDate && !this.endDate;
    const basesLimpias = this.sel.getDatabases().length === 0;
    const indicadoresLimpios = this.sel.getIndicators().length === 0;
    
    if (fechasLimpias && basesLimpias && indicadoresLimpios) {
      console.log('✅ Frontend completamente limpio y en estado inicial');
    } else {
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
    
    // Marcar como iniciando el proceso
    this.loading = true;
    this.apiResponse = null;
    
    console.log('🚀 Iniciando análisis...');
    
    this.api.upload(payload).subscribe({
      next: (resp: ApiResponse) => {
        console.log('✅ Resultados recibidos del backend');
        
        // Guardar los resultados
        this.apiResponse = resp;
        this.loading = false;
        
        // El servidor ya se resetea automáticamente al estado inicial
        console.log('✅ Trabajo completado - Servidor automáticamente en estado inicial');
        
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
        console.error('❌ Error del backend:', err.message);
        
        this.loading = false;
        this.apiResponse = null;
        
        // En caso de error, el servidor también se resetea automáticamente
        console.log('⚠️ Error en análisis - Servidor automáticamente reseteado');
        
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
    if (!this.apiResponse) {
      return [];
    }

    // Validar que tenemos resultados válidos
    if (!this.apiResponse.resultados || !Array.isArray(this.apiResponse.resultados)) {
      return [];
    }

    const desglosado: any[] = [];
    
    this.apiResponse.resultados.forEach((indicador) => {
      if (indicador.resultados && Array.isArray(indicador.resultados)) {
        indicador.resultados.forEach((resultado) => {
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
      }
    });
    
    return desglosado;
  }
}
