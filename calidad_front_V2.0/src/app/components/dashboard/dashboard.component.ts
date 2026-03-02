import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { ApiService } from '../../services/api.service';
import { SelectionService } from '../../services/selection.service';
import { MongodbService } from '../../services/mongodb.service'; // NUEVO
import { Subscription, forkJoin } from 'rxjs';

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
  
  // NUEVO: Nombre del archivo Excel para descargar
  excelFilename: string | null = null;
  // NUEVO: Nombre del archivo PDF para descargar
  pdfFilename: string | null = null;

  // NUEVO: Variable temporal para resultados MongoDB en modo híbrido
  private resultadosMongoTemp: any[] = [];

  constructor(
    private router: Router,
    private snack: MatSnackBar,
    public sel: SelectionService,
    private api: ApiService,
    private mongoService: MongodbService, // NUEVO
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
      
      // Solo mantener logs para debugging
      if (isConnected) {
        console.log('✅ WebSocket conectado exitosamente');
      } else {
        console.log('⚠️ WebSocket desconectado - Se intentará reconectar automáticamente');
      }
      
      this.cdr.detectChanges();
    });
  }

  // OPTIMIZADO: WebSocket SIN notificaciones en snackbar para evitar confundir al cliente
  private setupProgressWebSocket(): void {
    console.log('🔧 Configurando listeners WebSocket optimizado...');
    
    this.progressSubscription = this.api.getProgressUpdates().subscribe({
      next: (progress: any) => {
        console.log('📊 Progreso recibido:', progress);
        
        // 🔍 DIAGNÓSTICO: Log del progreso recibido
        console.log('🔍 [DIAGNÓSTICO DASHBOARD] === PROGRESO RECIBIDO ===');
        console.log('🔍 [DIAGNÓSTICO DASHBOARD] Timestamp:', new Date().toISOString());
        
        if (!progress) {
          console.log('🔍 [DIAGNÓSTICO DASHBOARD] ⚠️ progress es null/undefined, saliendo');
          return;
        }
        
        console.log('🔍 [DIAGNÓSTICO DASHBOARD] progress.porcentaje:', progress.porcentaje);
        console.log('🔍 [DIAGNÓSTICO DASHBOARD] progress.resultados existe:', !!progress.resultados);
        console.log('🔍 [DIAGNÓSTICO DASHBOARD] progress.resultados es Array:', Array.isArray(progress.resultados));
        console.log('🔍 [DIAGNÓSTICO DASHBOARD] progress.resultados.length:', progress.resultados?.length || 0);
        
        // Actualizar siempre el progreso visual
        this.progressPercentage = progress.porcentaje || 0;
        this.progressMessage = progress.mensaje || 'Procesando...';
        this.lastProgressUpdate = new Date().toLocaleTimeString();
        this.updateTimeEstimate(progress.porcentaje || 0);
        
        // 🎯 OPTIMIZADO: Detectar datos completos y procesar INMEDIATAMENTE
        const tieneResultados = progress.resultados && 
                               Array.isArray(progress.resultados) && 
                               progress.resultados.length > 0;
        
        if (tieneResultados) {
          console.log('🚀 ========================================');
          console.log('🚀 DATOS COMPLETOS DETECTADOS');
          console.log('🚀 ========================================');
          console.log('📊 Cantidad de resultados:', progress.resultados.length);
          console.log('💬 Mensaje:', progress.mensaje);
          console.log('📂 Excel:', progress.excelFilename);
          console.log('📄 PDF:', progress.pdfFilename);
          
          // 🎯 CRÍTICO: Confirmar recepción INMEDIATAMENTE (antes de procesar)
          console.log('📤 Confirmando recepción al backend INMEDIATAMENTE...');
          this.api.confirmDataReceived();
          
          // Luego procesar los datos
          this.procesarResultadosFinales(progress.resultados, progress.mensaje || 'Análisis completado', progress.excelFilename, progress.pdfFilename);
        }
        
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error en WebSocket:', error);
        console.log('🔍 [DIAGNÓSTICO DASHBOARD] ❌ ERROR en subscription de progreso:', error);
        this.loading = false;
        this.resetProgressIndicator();
        this.snack.open('Error de conexión - Revise la consola', 'OK', { 
          duration: 5000,
          panelClass: ['error-snackbar'] 
        });
      }
    });

    // BACKUP: Listener específico para evento de finalización directo
    this.api.getAnalysisCompletedUpdates().subscribe({
      next: (data: any) => {
        console.log('🎯 EVENTO DIRECTO: análisis-completado recibido:', data);
        
        if (data.resultados && Array.isArray(data.resultados) && data.resultados.length > 0) {
          console.log('📊 Procesando datos del evento directo (BACKUP)');
          
          // Confirmar recepción también en el backup
          this.api.confirmDataReceived();
          
          this.procesarResultadosFinales(data.resultados, data.mensaje || 'Análisis completado', data.excelFilename, data.pdfFilename);
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
      }
    });
    
    console.log('✅ WebSocket optimizado configurado');
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

    // NUEVO: Separar indicadores por fuente
    const indicadoresSeleccionados = this.sel.getIndicators();
    const indicadoresMongo = this.detectarIndicadoresMongoDB(indicadoresSeleccionados);
    const indicadoresFirebird = indicadoresSeleccionados.filter(id => !indicadoresMongo.includes(id));
    
    console.log('📊 Indicadores MongoDB:', indicadoresMongo.length);
    console.log('🗄️ Indicadores Firebird:', indicadoresFirebird.length);

    // CORREGIDO: No bloquear si WebSocket no está conectado, intentar reconectar en paralelo
    if (!this.isWebSocketConnected) {
      console.log('⚠️ WebSocket no conectado - Intentando reconectar en paralelo...');
      this.api.reconnect();
    }
    
    // OPTIMIZADO: Inicializar estado y limpiar datos anteriores
    this.loading = true;
    this.startTime = Date.now();
    this.progressPercentage = 0;
    this.progressMessage = 'Iniciando análisis...';
    this.timeRemaining = 0;
    this.apiResponse = null;
    this.tableData = [];
    this.lastProgressUpdate = new Date().toLocaleTimeString();
    
    console.log('🚀 Iniciando proceso híbrido Firebird + MongoDB');
    
    // NUEVO: Ejecutar consultas según las fuentes disponibles
    if (indicadoresMongo.length > 0 && indicadoresFirebird.length === 0) {
      // Solo MongoDB
      this.ejecutarSoloMongoDB(indicadoresMongo, payload);
    } else if (indicadoresMongo.length === 0 && indicadoresFirebird.length > 0) {
      // Solo Firebird (comportamiento original)
      this.ejecutarSoloFirebird(payload);
    } else if (indicadoresMongo.length > 0 && indicadoresFirebird.length > 0) {
      // Híbrido: ambas fuentes
      this.ejecutarHibrido(indicadoresMongo, indicadoresFirebird, payload);
    } else {
      this.loading = false;
      this.snack.open('No hay indicadores seleccionados', 'OK', { duration: 2500 });
    }
  }

  // NUEVO: Detectar si un indicador es de MongoDB (comienza con MONGO_)
  private detectarIndicadoresMongoDB(indicadores: string[]): string[] {
    return indicadores.filter(id => id.startsWith('MONGO_'));
  }

  // NUEVO: Ejecutar solo consultas MongoDB
  private ejecutarSoloMongoDB(indicadoresMongo: string[], payload: any): void {
    console.log('📊 Ejecutando SOLO MongoDB');
    
    const mongoPayload = {
      dbIds: payload.baseDatos,
      fechaIni: this.formatDateForMongo(payload.intervalo[0]),
      fechaFin: this.formatDateForMongo(payload.intervalo[1]),
      indicadores: indicadoresMongo
    };

    this.progressMessage = 'Consultando MongoDB...';
    this.progressPercentage = 10;
    
    this.mongoService.executeMongoQueries(mongoPayload).subscribe({
      next: (resultadosMongo) => {
        console.log('✅ Resultados MongoDB recibidos:', resultadosMongo);
        this.procesarResultadosMongoDB(resultadosMongo, payload.intervalo);
      },
      error: (err) => {
        console.error('❌ Error en consultas MongoDB:', err);
        this.loading = false;
        this.resetProgressIndicator();
        this.snack.open('Error consultando MongoDB: ' + (err?.error?.message || 'desconocido'), 'OK', { duration: 3500 });
      }
    });
  }

  // NUEVO: Ejecutar solo consultas Firebird (comportamiento original)
  private ejecutarSoloFirebird(payload: any): void {
    console.log('🗄️ Ejecutando SOLO Firebird');
    
    this.api.upload(payload).subscribe({
      next: (resp: any) => {
        console.log('✅ Petición HTTP Firebird enviada exitosamente');
        console.log('📡 WebSocket manejará las actualizaciones de progreso');
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

  // NUEVO: Ejecutar consultas híbridas (Firebird + MongoDB)
  private ejecutarHibrido(indicadoresMongo: string[], indicadoresFirebird: string[], payload: any): void {
    console.log('🔀 Ejecutando modo HÍBRIDO');
    console.log('  📊 MongoDB:', indicadoresMongo.length, 'indicadores');
    console.log('  🗄️ Firebird:', indicadoresFirebird.length, 'indicadores');

    this.progressMessage = 'Consultando ambas fuentes de datos...';
    this.progressPercentage = 10;

    // Preparar payload MongoDB
    const mongoPayload = {
      dbIds: payload.baseDatos,
      fechaIni: this.formatDateForMongo(payload.intervalo[0]),
      fechaFin: this.formatDateForMongo(payload.intervalo[1]),
      indicadores: indicadoresMongo
    };

    // Preparar payload Firebird (solo con indicadores Firebird)
    const firebirdPayload = {
      ...payload,
      indices: indicadoresFirebird
    };

    // Ejecutar ambas consultas en paralelo
    forkJoin({
      mongo: this.mongoService.executeMongoQueries(mongoPayload),
      firebird: this.api.upload(firebirdPayload)
    }).subscribe({
      next: (resultados) => {
        console.log('✅ Ambas consultas completadas');
        console.log('  📊 MongoDB:', resultados.mongo.length, 'resultados');
        console.log('  🗄️ Firebird: procesando vía WebSocket');
        
        // Guardar resultados MongoDB temporalmente
        this.resultadosMongoTemp = resultados.mongo;
        
        // Los resultados de Firebird llegarán vía WebSocket
        this.progressMessage = 'Procesando resultados Firebird...';
        this.progressPercentage = 50;
      },
      error: (err) => {
        console.error('❌ Error en consultas híbridas:', err);
        this.loading = false;
        this.resetProgressIndicator();
        this.snack.open('Error en consultas híbridas: ' + (err?.message || 'desconocido'), 'OK', { duration: 3500 });
      }
    });
  }

  // NUEVO: Procesar resultados MongoDB
  private procesarResultadosMongoDB(resultadosMongo: any[], intervalo: any): void {
    console.log('🔄 Procesando resultados MongoDB');
    
    // Convertir resultados MongoDB al formato esperado
    const resultadosFormateados = resultadosMongo.map(res => ({
      id_code: res.id_code,
      categoria: res.categoria,
      indicador: res.indicador,
      intervalo: {
        fechaInicio: intervalo[0],
        fechaFin: intervalo[1]
      },
      consulta_sql: 'MongoDB Aggregation Pipeline',
      bases_datos: [res.centro],
      resultados: [{
        baseData: res.centro,
        resultado: res.resultado,
        numeroDePacientes: res.numero_pacientes
      }],
      totales: {
        resultado: res.resultado,
        numero_pacientes: res.numero_pacientes
      }
    }));

    this.apiResponse = {
      success: true,
      message: 'Consultas MongoDB completadas',
      resultados: resultadosFormateados,
      timestamp: new Date().toISOString()
    };

    this.loading = false;
    this.progressPercentage = 100;
    this.progressMessage = 'Análisis MongoDB completado';
    
    this.updateTableData();
    this.cdr.detectChanges();
    
    this.snack.open('¡Consultas MongoDB completadas!', 'OK', { 
      duration: 4000,
      panelClass: ['success-snackbar']
    });
  }

  // NUEVO: Formatear fecha para MongoDB (dd-MM-yyyy)
  private formatDateForMongo(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch (error) {
      console.error('Error formateando fecha para MongoDB:', error);
      return dateStr;
    }
  }

  // MEJORADO: Procesar resultados finales (ahora combina MongoDB si existe)
  private procesarResultadosFinales(resultados: any[], mensaje: string, excelFilename?: string, pdfFilename?: string): void {
    console.log('🎯 === PROCESANDO RESULTADOS FINALES ===');
    console.log('📊 Cantidad de resultados Firebird:', resultados.length);
    console.log('📊 Resultados MongoDB temporales:', this.resultadosMongoTemp.length);
    
    // Evitar duplicados
    if (this.apiResponse) {
      console.log('⚠️ Ya existe apiResponse - Evitando duplicados');
      return;
    }

    // Guardar nombre del archivo Excel
    if (excelFilename) {
      this.excelFilename = excelFilename;
    }
    
    // Guardar nombre del archivo PDF
    if (pdfFilename) {
      this.pdfFilename = pdfFilename;
    }

    // NUEVO: Combinar resultados de MongoDB si existen
    let resultadosFinales = [...resultados];
    
    if (this.resultadosMongoTemp.length > 0) {
      console.log('🔀 Combinando resultados de MongoDB con Firebird');
      
      const intervalo = {
        fechaInicio: this.startDate?.toISOString() || '',
        fechaFin: this.endDate?.toISOString() || ''
      };
      
      const mongoFormateados = this.resultadosMongoTemp.map(res => ({
        id_code: res.id_code,
        categoria: res.categoria,
        indicador: res.indicador,
        intervalo: intervalo,
        consulta_sql: 'MongoDB Aggregation Pipeline',
        bases_datos: [res.centro],
        resultados: [{
          baseData: res.centro,
          resultado: res.resultado,
          numeroDePacientes: res.numero_pacientes
        }],
        totales: {
          resultado: res.resultado,
          numero_pacientes: res.numero_pacientes
        }
      }));
      
      resultadosFinales = [...resultadosFinales, ...mongoFormateados];
      console.log('✅ Resultados combinados:', resultadosFinales.length);
      
      // Limpiar temporal
      this.resultadosMongoTemp = [];
    }

    // Crear apiResponse INMEDIATAMENTE
    this.apiResponse = {
      success: true,
      message: mensaje,
      resultados: resultadosFinales,
      timestamp: new Date().toISOString()
    };
    
    this.loading = false;
    
    // Actualizar tabla SIN delays
    console.log('🔄 Actualizando tabla inmediatamente');
    this.updateTableData();
    
    // Forzar detección de cambios inmediatamente
    this.cdr.markForCheck();
    this.cdr.detectChanges();
    
    // Backup: una actualización más después de 50ms
    setTimeout(() => {
      this.cdr.markForCheck();
      this.cdr.detectChanges();
      
      console.log('✅ Estado final de la tabla:');
      console.log('  - apiResponse existe:', !!this.apiResponse);
      console.log('  - cantidad resultados:', this.apiResponse?.resultados?.length || 0);
      console.log('  - tableData.length:', this.tableData.length);
      console.log('  - loading:', this.loading);
      console.log('  - excelFilename:', this.excelFilename);
      console.log('  - pdfFilename:', this.pdfFilename);
      
      if (this.tableData.length > 0) {
        console.log('🎉 ÉXITO: Tabla actualizada con', this.tableData.length, 'filas');
      } else {
        console.error('❌ PROBLEMA: Tabla sigue vacía');
      }
    }, 50);
    
    // Solo UNA notificación al completarse
    this.snack.open('¡Análisis completado exitosamente!', 'OK', { 
      duration: 4000,
      panelClass: ['success-snackbar']
    });
    
    console.log('✅ === PROCESAMIENTO COMPLETADO ===');
  }

  // NUEVO: Método para descargar el Excel desde el dashboard
  downloadExcel(): void {
    if (this.excelFilename) {
      this.api.downloadExcel(this.excelFilename);
    } else {
      this.snack.open('No hay archivo Excel disponible para descargar', 'OK', { duration: 3000 });
    }
  }

  // NUEVO: Método para descargar el PDF desde el dashboard
  downloadPdf(): void {
    if (this.pdfFilename) {
      this.api.downloadPdf(this.pdfFilename);
    } else {
      this.snack.open('No hay archivo PDF disponible para descargar', 'OK', { duration: 3000 });
    }
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

  // NUEVO: Determinar dinámicamente el número de decimales
  getDecimalPlaces(element: any): number {
    if (!element || !element.indicador) return 2;
    
    const nombre = element.indicador.toLowerCase();
    
    // 1. Si es explícitamente un porcentaje o tasa, SIEMPRE decimales
    if (nombre.includes('porcentaje') || nombre.includes('%') || nombre.includes('tasa') || nombre.includes('media') || nombre.includes('promedio')) {
      return 2;
    }

    // 2. Si es un conteo de pacientes o números absolutos (y no cayó en la regla anterior), CERO decimales
    if (nombre.includes('pacientes') || nombre.includes('número') || nombre.includes('nº') || nombre.includes('total')) {
      return 0;
    }

    // 3. Por defecto para otros valores clínicos (Kt/V, Hemoglobina, etc.) mantenemos decimales
    return 2;
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
