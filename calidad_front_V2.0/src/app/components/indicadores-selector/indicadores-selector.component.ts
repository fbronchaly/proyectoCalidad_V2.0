import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { SelectionService } from '../../services/selection.service';
import { MongodbService, MongoIndicador } from '../../services/mongodb.service';

interface Indicador {
  id_code: string;
  categoria: string;
  indicador: string;
  fuente?: 'firebird' | 'mongodb'; // NUEVO: Identificar la fuente
}

@Component({
  selector: 'app-indicadores-selector',
  templateUrl: './indicadores-selector.component.html',
  styleUrls: ['./indicadores-selector.component.scss']
})
export class IndicadoresSelectorComponent implements OnInit {
  categorias: Record<string, Indicador[]> = {};
  selected = new Set<string>();
  allToggle = false;
  categoryToggles: Record<string, boolean> = {};
  // NUEVO: Variables para MongoDB
  loadingMongo = false;
  mongoIndicadoresDisponibles = false;

  constructor(
    private http: HttpClient,
    private snack: MatSnackBar,
    private router: Router,
    private sel: SelectionService,
    private mongoService: MongodbService // NUEVO: Inyectar servicio MongoDB
  ) {}

  ngOnInit(): void {
    this.selected = new Set(this.sel.getIndicators());
    
    // Cargar indicadores Firebird
    this.cargarIndicadoresFirebird();
    
    // Cargar indicadores MongoDB
    this.cargarIndicadoresMongoDB();
  }

  // NUEVO: Método para cargar indicadores Firebird
  private cargarIndicadoresFirebird(): void {
    this.http.get<Indicador[]>('assets/indicesJSON.json').subscribe({
      next: (arr) => {
        arr.forEach((i: any) => {
          const k = i.categoria || 'Sin categoría';
          if (!this.categorias[k]) this.categorias[k] = [];
          this.categorias[k].push({ 
            id_code: i.id_code, 
            categoria: k, 
            indicador: i.indicador,
            fuente: 'firebird'
          });
        });
        this.actualizarToggles();
      },
      error: () => this.snack.open('No se pudo cargar indicadores Firebird', 'OK', { duration: 3000 })
    });
  }

  // NUEVO: Método para cargar indicadores MongoDB
  private cargarIndicadoresMongoDB(): void {
    this.loadingMongo = true;
    
    this.mongoService.getMongoIndicadores().subscribe({
      next: (mongoIndicadores: MongoIndicador[]) => {
        console.log('📊 Indicadores MongoDB cargados:', mongoIndicadores.length);
        
        // CAMBIADO: Crear categoría especial al final para indicadores externos
        const categoriaExterna = '🔗 Indicadores Externos (no Nefrosoft)';
        if (!this.categorias[categoriaExterna]) {
          this.categorias[categoriaExterna] = [];
        }
        
        mongoIndicadores.forEach((ind) => {
          this.categorias[categoriaExterna].push({
            id_code: ind.id_code,
            categoria: categoriaExterna,
            indicador: ind.indicador,
            fuente: 'mongodb'
          });
        });
        
        this.mongoIndicadoresDisponibles = mongoIndicadores.length > 0;
        this.actualizarToggles();
        this.loadingMongo = false;
        
        if (mongoIndicadores.length > 0) {
          console.log('✅ Indicadores externos MongoDB integrados en categoría especial');
        }
      },
      error: (err) => {
        console.error('❌ Error cargando indicadores MongoDB:', err);
        this.loadingMongo = false;
        this.snack.open('No se pudieron cargar indicadores externos', 'OK', { duration: 3000 });
      }
    });
  }

  // NUEVO: Método para actualizar los toggles de categorías
  private actualizarToggles(): void {
    Object.keys(this.categorias).forEach(k => {
      const allIds = this.categorias[k].map(x => x.id_code);
      this.categoryToggles[k] = allIds.every(id => this.selected.has(id));
    });
    const allIds = Object.values(this.categorias).flat().map(x => x.id_code);
    this.allToggle = allIds.length > 0 && allIds.every(id => this.selected.has(id));
  }

  toggleCategory(cat: string, checked: boolean) {
    this.categoryToggles[cat] = checked;
    const ids = this.categorias[cat].map(x => x.id_code);
    if (checked) ids.forEach(id => this.selected.add(id));
    else ids.forEach(id => this.selected.delete(id));
    const allIds = Object.values(this.categorias).flat().map(x => x.id_code);
    this.allToggle = allIds.every(id => this.selected.has(id));
  }

  toggleAll(checked: boolean) {
    this.allToggle = checked;
    Object.keys(this.categorias).forEach(cat => this.categoryToggles[cat] = checked);
    const allIds = Object.values(this.categorias).flat().map(x => x.id_code);
    if (checked) allIds.forEach(id => this.selected.add(id));
    else this.selected.clear();
  }

  toggleOne(id: string, cat: string, checked: boolean) {
    if (checked) this.selected.add(id); else this.selected.delete(id);
    const ids = this.categorias[cat].map(x => x.id_code);
    this.categoryToggles[cat] = ids.every(x => this.selected.has(x));
    const allIds = Object.values(this.categorias).flat().map(x => x.id_code);
    this.allToggle = allIds.every(x => this.selected.has(x));
  }

  // Métodos helper para el template
  getCategorias(): string[] {
    const CATEGORIA_MONGO = '🔗 Indicadores Externos (no Nefrosoft)';
    const todas = Object.keys(this.categorias);
    const firebird = todas.filter(k => k !== CATEGORIA_MONGO);
    const mongo    = todas.filter(k => k === CATEGORIA_MONGO);
    return [...firebird, ...mongo];
  }

  getSelectedCount(): number {
    return this.selected.size;
  }

  getTotalCount(): number {
    return Object.values(this.categorias).flat().length;
  }

  getSelectedCountByCategory(categoria: string): number {
    const ids = this.categorias[categoria]?.map(x => x.id_code) || [];
    return ids.filter(id => this.selected.has(id)).length;
  }

  getTotalCountByCategory(categoria: string): number {
    return this.categorias[categoria]?.length || 0;
  }

  isCategoryFullySelected(categoria: string): boolean {
    return this.categoryToggles[categoria] || false;
  }

  hasNoSelectedInCategory(categoria: string): boolean {
    return this.getSelectedCountByCategory(categoria) === 0;
  }

  clearAll(): void {
    this.selected.clear();
    Object.keys(this.categoryToggles).forEach(cat => this.categoryToggles[cat] = false);
    this.allToggle = false;
    this.snack.open('Todos los indicadores deseleccionados', 'OK', { duration: 1500 });
  }

  selectAllByCategory(categoria: string): void {
    this.toggleCategory(categoria, true);
    this.snack.open(`Seleccionados todos los indicadores de ${categoria}`, 'OK', { duration: 1500 });
  }

  clearByCategory(categoria: string): void {
    this.toggleCategory(categoria, false);
    this.snack.open(`Deseleccionados todos los indicadores de ${categoria}`, 'OK', { duration: 1500 });
  }

  saveAndBack() {
    this.sel.setIndicators(Array.from(this.selected));
    this.snack.open('Indicadores seleccionados: ' + this.selected.size, 'OK', { duration: 1500 });
    this.router.navigate(['/dashboard']);
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  // NUEVO: Método para obtener el badge de fuente
  getFuenteBadge(indicador: Indicador): string {
    return indicador.fuente === 'mongodb' ? '📊 MongoDB' : '🗄️ Firebird';
  }

  // NUEVO: Método para obtener color del badge
  getFuenteColor(indicador: Indicador): string {
    return indicador.fuente === 'mongodb' ? 'primary' : 'accent';
  }
}
