import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { Subscription } from 'rxjs';

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
export class DashboardComponent implements OnInit, OnDestroy {
  startDate: Date | null = null;
  endDate: Date | null = null;
  loading = false;
  apiResponse: ApiResponse | null = null;
  maxEndDate: Date = new Date(new Date().setDate(new Date().getDate() - 1));

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

  // NUEVAS propiedades para indicador de progreso
  progressPercentage: number = 0;
  progressMessage: string = '';
  timeRemaining: number = 0;
  startTime: number = 0;
  private progressSubscription: Subscription | null = null;
  private resetSubscription: Subscription | null = null;
  private connectionSubscription: Subscription | null = null;

  // NUEVO: Variables para debugging
  isWebSocketConnected: boolean = false;
  lastProgressUpdate: string = '';
  debugMode: boolean = false;

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
    
    // MEJORADO: Configurar WebSocket para progreso con mejor debugging
    this.setupProgressWebSocket();
    this.setupConnectionMonitoring();
  }

  ngOnDestroy(): void {
    // MEJORADO: Limpiar todas las suscripciones
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
    }
    if (this.resetSubscription) {
      this.resetSubscription.unsubscribe();
    }
    if (this.connectionSubscription) {
      this.connectionSubscription.unsubscribe();
    }
    this.api.disconnect();
  }

  // CORREGIDO: Monitorear estado de conexión WebSocket SIN notificaciones confusas
  private setupConnectionMonitoring(): void {
    this.connectionSubscription = this.api.isConnected.subscribe(isConnected => {
      this.isWebSocketConnected = isConnected;
      console.log('🔌 Estado conexión WebSocket cambiado:', isConnected);
      
      // ELIMINADO: Las notificaciones que confunden al cliente
      // Solo mantener logs para debugging
      if (isConnected) {
        console.log('✅ WebSocket conectado exitosamente');
      } else {
        console.log('⚠️ WebSocket desconectado - Se intentará reconectar automáticamente');
      }
      
      this.cdr.detectChanges();
    });
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
    
    console.log('🔄 Enviando reset al backend...');
    
    // 5. Llamar al endpoint de reset del backend para detener procesos y limpiar archivos
    this.api.reset().subscribe({
      next: (response) => {
        console.log('✅ Reset del backend exitoso:', response);
        // 6. Confirmar que el sistema está listo para nuevos análisis
        this.prepararParaNuevoAnalisis();
        
        this.snack.open('Sistema reiniciado completamente', 'OK', { 
          duration: 3000,
          panelClass: ['success-snackbar']
        });
      },
      error: (error) => {
        console.error('❌ Error en reset del backend:', error);
        // Aunque haya error en el backend, el frontend ya está limpio
        this.prepararParaNuevoAnalisis();
        
        this.snack.open('Frontend reiniciado (advertencia: error en backend)', 'OK', { 
          duration: 3500,
          panelClass: ['warning-snackbar']
        });
      }
    });
    
    // NUEVO: Resetear también el indicador de progreso
    this.resetProgressIndicator();
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

  // CORREGIDO: Método para actualizar la tabla con debugging mejorado
  private updateTableData(): void {
    console.log('🔄 === INICIANDO updateTableData ===');
    console.log('📊 Estado actual - apiResponse:', this.apiResponse);
    console.log('📊 Estado actual - loading:', this.loading);
    console.log('📊 Estado actual - tableData.length antes:', this.tableData.length);
    
    // Verificación exhaustiva de datos
    if (!this.apiResponse) {
      console.log('❌ No hay apiResponse disponible');
      this.dataSource.data = [];
      this.tableData = [];
      this.cdr.detectChanges();
      return;
    }

    if (!this.apiResponse.resultados) {
      console.log('❌ apiResponse.resultados es null/undefined');
      console.log('📋 apiResponse completo:', JSON.stringify(this.apiResponse, null, 2));
      this.dataSource.data = [];
      this.tableData = [];
      this.cdr.detectChanges();
      return;
    }

    if (!Array.isArray(this.apiResponse.resultados)) {
      console.log('❌ apiResponse.resultados no es un array:', typeof this.apiResponse.resultados);
      this.dataSource.data = [];
      this.tableData = [];
      this.cdr.detectChanges();
      return;
    }

    if (this.apiResponse.resultados.length === 0) {
      console.log('⚠️ apiResponse.resultados está vacío');
      this.dataSource.data = [];
      this.tableData = [];
      this.cdr.detectChanges();
      return;
    }

    console.log(`✅ Procesando ${this.apiResponse.resultados.length} indicadores`);

    const newTableData: any[] = [];
    
    this.apiResponse.resultados.forEach((indicador, indicadorIndex) => {
      console.log(`\n--- Procesando indicador ${indicadorIndex + 1} ---`);
      console.log('🏷️ ID:', indicador.id_code);
      console.log('📂 Categoría:', indicador.categoria);
      console.log('📋 Indicador:', indicador.indicador);
      console.log('🔗 Resultados:', indicador.resultados);
      console.log('🧮 Totales:', indicador.totales);

      // Verificar que el indicador tiene la estructura correcta
      if (!indicador.id_code) {
        console.warn(`⚠️ Indicador ${indicadorIndex} sin id_code`);
      }
      if (!indicador.categoria) {
        console.warn(`⚠️ Indicador ${indicadorIndex} sin categoria`);
      }
      if (!indicador.indicador) {
        console.warn(`⚠️ Indicador ${indicadorIndex} sin nombre de indicador`);
      }
      
      // Procesar resultados parciales (por cada base de datos)
      if (indicador.resultados && Array.isArray(indicador.resultados)) {
        console.log(`📊 Procesando ${indicador.resultados.length} resultados para ${indicador.indicador}`);
        
        indicador.resultados.forEach((resultado, resultadoIndex) => {
          console.log(`  💾 Resultado ${resultadoIndex + 1}:`, {
            baseData: resultado.baseData,
            resultado: resultado.resultado,
            numeroDePacientes: resultado.numeroDePacientes
          });

          // Crear fila de tabla con validación de datos
          const filaTabla = {
            id_code: indicador.id_code || 'N/A',
            categoria: indicador.categoria || 'Sin categoría',
            indicador: indicador.indicador || 'Sin nombre',
            baseData: resultado.baseData || 'Sin base',
            resultado: resultado.resultado !== undefined ? resultado.resultado : 0,
            numeroDePacientes: resultado.numeroDePacientes !== undefined ? resultado.numeroDePacientes : 0,
            indicadorCompleto: indicador,
            esTotal: false // Marcar como resultado parcial
          };

          newTableData.push(filaTabla);
          console.log(`  ✅ Fila añadida:`, filaTabla);
        });
      } else {
        console.warn(`⚠️ Indicador ${indicadorIndex} no tiene resultados válidos:`, indicador.resultados);
      }

      // NUEVO: Procesar totales agregados (suma de todas las bases)
      if (indicador.totales && indicador.resultados?.length > 0) {
        console.log(`🧮 Agregando fila de TOTALES para ${indicador.indicador}:`, {
          resultado: indicador.totales.resultado,
          numero_pacientes: indicador.totales.numero_pacientes
        });

        // Crear fila especial de totales
        const filaTotales = {
          id_code: indicador.id_code || 'N/A',
          categoria: indicador.categoria || 'Sin categoría',
          indicador: indicador.indicador || 'Sin nombre',
          baseData: 'TOTAL', // Identificador especial para totales
          resultado: indicador.totales.resultado !== undefined ? indicador.totales.resultado : 0,
          numeroDePacientes: indicador.totales.numero_pacientes !== undefined ? indicador.totales.numero_pacientes : 0,
          indicadorCompleto: indicador,
          esTotal: true // Marcar como fila de totales
        };

        newTableData.push(filaTotales);
        console.log(`  🧮 Fila de totales añadida:`, filaTotales);
      } else if (indicador.totales) {
        console.log(`⚠️ Totales existen pero no se agregaron para ${indicador.indicador}:`, {
          totales: indicador.totales,
          resultadosLength: indicador.resultados?.length,
          condicion: 'indicador.totales && indicador.resultados?.length > 0'
        });
      }
    });
    
    console.log(`🎯 Total filas generadas: ${newTableData.length}`);
    console.log('📋 Primeras 3 filas generadas:', newTableData.slice(0, 3));
    
    // Asignar datos y forzar detección de cambios múltiples veces
    this.tableData = [...newTableData]; // Crear nueva referencia
    this.dataSource.data = [...newTableData]; // Crear nueva referencia
    
    console.log('🔄 Datos asignados - Forzando detección de cambios...');
    this.cdr.detectChanges();
    
    // Forzar segunda detección por si acaso
    setTimeout(() => {
      console.log('🔄 Segunda detección de cambios...');
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }, 50);
    
    // Verificación final
    setTimeout(() => {
      console.log('📊 === VERIFICACIÓN FINAL updateTableData ===');
      console.log('📋 tableData.length final:', this.tableData.length);
      console.log('📋 dataSource.data.length final:', this.dataSource.data.length);
      console.log('📋 Primeras 2 filas finales:', this.tableData.slice(0, 2));
      
      if (this.tableData.length === 0) {
        console.error('❌ PROBLEMA: tableData sigue vacío después de la actualización');
        console.error('🔍 Datos originales para debug:', {
          apiResponse: this.apiResponse,
          resultados: this.apiResponse?.resultados,
          resultadosLength: this.apiResponse?.resultados?.length
        });
      } else {
        console.log('✅ Tabla actualizada exitosamente');
        console.log('🧮 Filas de totales incluidas:', this.tableData.filter(f => f.esTotal).length);
      }
    }, 100);
  }

  sendToBack() {
    const payload = this.sel.toJSON();
    
    console.log('=== ENVIANDO PETICIÓN AL BACKEND ===');
    console.log('Payload enviado:', payload);
    console.log('Estado WebSocket:', this.isWebSocketConnected ? 'Conectado' : 'Desconectado');
    
    if (!this.readyToSendFront || !payload.intervalo) {
      this.snack.open('Completa rango, bases e indicadores', 'OK', { duration: 2500 });
      return;
    }

    // CORREGIDO: No bloquear si WebSocket no está conectado, intentar reconectar en paralelo
    if (!this.isWebSocketConnected) {
      console.log('⚠️ WebSocket no conectado - Intentando reconectar en paralelo...');
      this.api.reconnect();
      // NO return aquí - continuar con el proceso
    }
    
    // OPTIMIZADO: Inicializar estado y limpiar datos anteriores
    this.loading = true;
    this.startTime = Date.now();
    this.progressPercentage = 0;
    this.progressMessage = 'Iniciando análisis...';
    this.timeRemaining = 0;
    this.apiResponse = null; // Limpiar datos anteriores
    this.tableData = []; // Limpiar tabla anterior
    this.lastProgressUpdate = new Date().toLocaleTimeString();
    
    console.log('🚀 Iniciando proceso - WebSocket reconectará automáticamente si es necesario');
    
    // SIMPLIFICADO: Enviar la petición, WebSocket maneja todo
    this.api.upload(payload).subscribe({
      next: (resp: any) => {
        console.log('✅ Petición HTTP enviada exitosamente');
        console.log('📡 WebSocket manejará las actualizaciones de progreso');
        // Ya no procesamos aquí - WebSocket maneja todo
      },
      error: (err) => {
        console.error('❌ Error enviando petición HTTP:', err);
        this.loading = false;
        this.resetProgressIndicator();
        this.apiResponse = null;
        this.tableData = [];
        this.snack.open('Error al enviar petición: ' + (err?.error?.message || 'desconocido'), 'OK', { duration: 3500 });
      }
    });
  }

  // OPTIMIZADO: WebSocket SIN notificaciones en snackbar para evitar confundir al cliente
  private setupProgressWebSocket(): void {
    console.log('🔧 Configurando listeners WebSocket optimizado...');
    
    this.progressSubscription = this.api.getProgressUpdates().subscribe({
      next: (progress: any) => {
        console.log('📊 Progreso recibido:', progress);
        
        if (!progress) return;
        
        // Actualizar siempre el progreso visual
        this.progressPercentage = progress.porcentaje || 0;
        this.progressMessage = progress.mensaje || 'Procesando...';
        this.lastProgressUpdate = new Date().toLocaleTimeString();
        this.updateTimeEstimate(progress.porcentaje || 0);
        
        // 🎯 SINCRONIZADO: Al llegar al 100% con datos, mostrar tabla INMEDIATAMENTE
        if (progress.porcentaje === 100 && progress.resultados) {
          console.log('🚀 SINCRONIZADO: 100% + DATOS recibidos - Mostrando tabla inmediatamente');
          console.log('📊 Cantidad de resultados recibidos:', progress.resultados.length);
          
          this.procesarResultadosFinales(progress.resultados, progress.mensaje || 'Análisis completado');
        } 
        // Backup: evento de finalización sin datos embebidos
        else if (progress.completed && progress.resultados) {
          console.log('✅ Evento de finalización con datos recibido');
          this.procesarResultadosFinales(progress.resultados, progress.mensaje || 'Análisis completado');
        }
        // NUEVO: Caso especial para resultados sin porcentaje específico
        else if (progress.resultados && Array.isArray(progress.resultados) && progress.resultados.length > 0) {
          console.log('🎯 CASO ESPECIAL: Resultados recibidos sin porcentaje 100%');
          console.log('📊 Cantidad de resultados:', progress.resultados.length);
          
          this.procesarResultadosFinales(progress.resultados, progress.mensaje || 'Datos recibidos');
        }
        
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error en WebSocket:', error);
        this.loading = false;
        this.resetProgressIndicator();
        // Solo notificar errores críticos
        this.snack.open('Error de conexión - Revise la consola', 'OK', { 
          duration: 5000,
          panelClass: ['error-snackbar'] 
        });
      }
    });

    // NUEVO: Listener específico para evento de finalización directo
    this.api.getAnalysisCompletedUpdates().subscribe({
      next: (data: any) => {
        console.log('🎯 EVENTO DIRECTO: análisis-completado recibido:', data);
        if (data.resultados && Array.isArray(data.resultados)) {
          console.log('📊 Procesando datos del evento directo');
          this.procesarResultadosFinales(data.resultados, data.mensaje || 'Análisis completado');
        }
      },
      error: (error) => {
        console.error('❌ Error en evento análisis-completado:', error);
      }
    });

    // Reset subscription SIN notificaciones
    this.resetSubscription = this.api.getServerResetUpdates().subscribe({
      next: (data: any) => {
        console.log('🔄 Reset del servidor recibido');
        if (!this.loading) {
          this.resetProgressIndicator();
        }
        this.cdr.detectChanges();
        // Sin notificación de reset para no confundir
      }
    });
    
    console.log('✅ WebSocket optimizado configurado SIN notificaciones molestas');
  }

  // NUEVO: Método centralizado para procesar resultados finales
  private procesarResultadosFinales(resultados: any[], mensaje: string): void {
    console.log('🎯 === PROCESANDO RESULTADOS FINALES ===');
    console.log('📊 Cantidad de resultados:', resultados.length);
    console.log('💬 Mensaje:', mensaje);

    if (this.apiResponse) {
      console.log('⚠️ Ya existe apiResponse - Evitando duplicados');
      return;
    }

    this.apiResponse = {
      success: true,
      message: mensaje,
      resultados: resultados,
      timestamp: new Date().toISOString()
    };
    
    this.loading = false;
    
    // CORREGIDO: Múltiples actualizaciones forzadas para garantizar renderizado
    console.log('🔄 Actualizando tabla - Intento 1');
    this.updateTableData();
    
    setTimeout(() => {
      console.log('🔄 Actualizando tabla - Intento 2 (backup)');
      this.updateTableData();
      this.cdr.markForCheck();
      this.cdr.detectChanges();
    }, 100);
    
    setTimeout(() => {
      console.log('🔄 Actualizando tabla - Intento 3 (final)');
      this.cdr.markForCheck();
      this.cdr.detectChanges();
      
      // 🎯 CRÍTICO: Confirmar recepción al backend DESPUÉS de procesar
      this.api.confirmDataReceived();
      console.log('✅ Confirmación enviada al backend - Puede resetear ahora');
      
      // Verificación final de los datos
      console.log('✅ Estado final de la tabla:');
      console.log('  - apiResponse existe:', !!this.apiResponse);
      console.log('  - resultados existe:', !!this.apiResponse?.resultados);
      console.log('  - cantidad resultados:', this.apiResponse?.resultados?.length || 0);
      console.log('  - tableData.length:', this.tableData.length);
      console.log('  - loading:', this.loading);
      
      if (this.tableData.length > 0) {
        console.log('🎉 ÉXITO: Tabla actualizada con', this.tableData.length, 'filas');
      } else {
        console.error('❌ PROBLEMA: Tabla sigue vacía después de todas las actualizaciones');
      }
    }, 200);
    
    // Solo UNA notificación importante al completarse
    this.snack.open('¡Análisis completado exitosamente!', 'OK', { 
      duration: 4000,
      panelClass: ['success-snackbar']
    });
    
    console.log('✅ === PROCESAMIENTO DE RESULTADOS COMPLETADO ===');
  }

  // NUEVO: Calcular tiempo restante estimado
  private updateTimeEstimate(percentage: number): void {
    if (percentage > 5 && this.startTime > 0) {
      const elapsed = Date.now() - this.startTime;
      const estimated = (elapsed / percentage) * 100;
      this.timeRemaining = Math.max(0, estimated - elapsed);
    } else {
      this.timeRemaining = 0;
    }
  }

  // NUEVO: Resetear indicador de progreso
  private resetProgressIndicator(): void {
    this.progressPercentage = 0;
    this.progressMessage = '';
    this.timeRemaining = 0;
    this.startTime = 0;
  }

  // NUEVO: Formatear tiempo restante
  formatTimeRemaining(milliseconds: number): string {
    if (!milliseconds || milliseconds <= 0) return '';
    
    const seconds = Math.ceil(milliseconds / 1000);
    if (seconds < 60) {
      return `${seconds} segundos`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes} minutos`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
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

  // NUEVO: Método para activar/desactivar modo debug
  toggleDebugMode(): void {
    this.debugMode = !this.debugMode;
    console.log('🐛 Modo debug:', this.debugMode ? 'ACTIVADO' : 'DESACTIVADO');
    this.snack.open(`Modo debug ${this.debugMode ? 'activado' : 'desactivado'}`, 'OK', { duration: 2000 });
  }

  // NUEVO: Método para probar conexión WebSocket
  testWebSocket(): void {
    console.log('🧪 Probando conexión WebSocket...');
    console.log('Estado actual:', this.api.checkConnection() ? 'Conectado' : 'Desconectado');
    
    if (this.api.checkConnection()) {
      this.api.sendTestMessage();
      this.snack.open('Mensaje de prueba enviado', 'OK', { duration: 2000 });
    } else {
      this.snack.open('WebSocket no conectado', 'Reconectar', { duration: 3000 });
      this.api.reconnect();
    }
  }

  // NUEVO: Método para forzar reconexión
  forceReconnect(): void {
    console.log('🔄 Forzando reconexión WebSocket...');
    this.api.reconnect();
    this.snack.open('Reconectando WebSocket...', 'OK', { duration: 2000 });
  }

  // NUEVO: Método trackBy para mejorar rendimiento de la tabla
  trackByIndex(index: number, item: any): any {
    return index;
  }
}
