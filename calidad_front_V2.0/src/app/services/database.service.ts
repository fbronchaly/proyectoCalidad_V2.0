// src/app/services/database.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, map, distinctUntilChanged, shareReplay } from 'rxjs';

const STORAGE_KEY = 'selected_databases';

export interface DatabaseItem {
  id: string;        // "DB1"
  label: string;     // "Santa Engracia"
  path: string;      // ruta al .gdb
  selected: boolean; // estado
  region: string;    // "Madrid", "Castilla y León", "Galicia"
}

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  // Lista base actualizada con regiones
  private readonly initialList: DatabaseItem[] = [
    { id: 'DB1',  label: 'Santa Engracia',   path: '/NFS/restores/NF6_SantaEngracia.gdb', selected: false, region: 'Madrid' },
    { id: 'DB2',  label: 'Los Olmos',        path: '/NFS/restores/NF6_LosOlmos.gdb',      selected: false, region: 'Castilla y León' },
    { id: 'DB3',  label: 'Los Llanos',       path: '/NFS/restores/NF6_LosLlanos.gdb',     selected: false, region: 'Madrid' },
    { id: 'DB4',  label: 'El Castañar',      path: '/NFS/restores/NF6_ElCastanar.gdb',    selected: false, region: 'Castilla y León' },
    { id: 'DB5',  label: 'Getafe',           path: '/NFS/restores/NF6_Getafe.gdb',        selected: false, region: 'Madrid' },
    { id: 'DB6',  label: 'Los Lauros',       path: '/NFS/restores/NF6_LosLauros.gdb',     selected: false, region: 'Madrid' },
    { id: 'DB8',  label: 'FJD',              path: '/NFS/restores/NF6_FJD.gdb',           selected: false, region: 'Madrid' },
    { id: 'DB9',  label: 'HRJC',             path: '/NFS/restores/NF6_HRJC.gdb',          selected: false, region: 'Madrid' },
    { id: 'DB10', label: 'Infanta Elena',    path: '/NFS/restores/NF6_InfantaElena.gdb',  selected: false, region: 'Madrid' },
    { id: 'DB11', label: 'Las Encinas',      path: '/NFS/restores/NF6_LasEncinas.gdb',    selected: false, region: 'Castilla y León' },
    { id: 'DB13', label: 'Los Llanos 3',     path: '/NFS/restores/NF6_LosLlanos3.gdb',    selected: false, region: 'Madrid' },
    { id: 'DB14', label: 'Os Carballos',     path: '/NFS/restores/NF6_OsCarballos.gdb',   selected: false, region: 'Galicia' },
    { id: 'DB15', label: 'Os Carballos II',  path: '/NFS/restores/NF6_OsCarballosII.gdb', selected: false, region: 'Galicia' },
    { id: 'DB16', label: 'Teixedal',         path: '/NFS/restores/NF6_Teixedal.gdb',      selected: false, region: 'Galicia' },
    { id: 'DB17', label: 'Villalba',         path: '/NFS/restores/NF6_VILLALBA.gdb',      selected: false, region: 'Madrid' },
    { id: 'DB18', label: 'Los Pinos',        path: '/NFS/restores/NF6_LosPinos.gdb',      selected: false, region: 'Castilla y León' },
  ];

  // Mover la inicialización aquí
  private readonly _databases$ = new BehaviorSubject<DatabaseItem[]>(
    this.loadFromStorage() || this.initialList
  );

  public readonly databases$ = this._databases$.asObservable();

  public readonly selectedIds$ = this.databases$.pipe(
    map(list => list.filter(d => d.selected).map(d => d.id)),
    distinctUntilChanged((a, b) => a.length === b.length && a.every((v, i) => v === b[i])),
    shareReplay(1)
  );

  constructor() {
    // El constructor ahora está vacío ya que la inicialización se hace arriba
  }

  private loadFromStorage(): DatabaseItem[] | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;

      const selectedIds = new Set(JSON.parse(saved));
      return this.initialList.map(item => ({
        ...item,
        selected: selectedIds.has(item.id)
      }));
    } catch (error) {
      console.error('Error cargando selecciones:', error);
      return null;
    }
  }

  // ----- Helpers internos -----
  private snapshot(): DatabaseItem[] {
    return this._databases$.value;
  }

  private emit(list: DatabaseItem[]): void {
    this._databases$.next(list);
    this.saveSelection(); // Guardar automáticamente cada vez que cambia el estado
  }

  // ----- API pública -----
  getAll(): DatabaseItem[] {
    return this.snapshot();
  }

  getSelected(): DatabaseItem[] {
    return this.snapshot().filter(d => d.selected);
  }

  toggle(id: string): void {
    const list = this.snapshot().map(d =>
      d.id === id ? { ...d, selected: !d.selected } : d
    );
    this._databases$.next(list);
    this.saveSelection(); // Guardar inmediatamente
  }

  selectAll(): void {
    const list = this.snapshot().map(d => ({ ...d, selected: true }));
    this._databases$.next(list);
    this.saveSelection(); // Guardar inmediatamente
  }

  clear(): void {
    const list = this.snapshot().map(d => ({ ...d, selected: false }));
    this._databases$.next(list);
    this.saveSelection(); // Guardar inmediatamente
  }

  saveSelection(): void {
    try {
      const selectedIds = this.getSelected().map(d => d.id);
      console.log('Guardando bases de datos:', selectedIds); // Debug
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
    } catch (error) {
      console.error('Error guardando selecciones:', error);
    }
  }

  applySelection(ids: string[]): void {
    const set = new Set(ids);
    this.emit(this.snapshot().map(d => ({ ...d, selected: set.has(d.id) })));
  }

  // Nuevos métodos para manejo por regiones
  getRegions(): string[] {
    const regions = new Set(this.initialList.map(db => db.region));
    return Array.from(regions).sort();
  }

  getDatabasesByRegion(region: string): DatabaseItem[] {
    return this.snapshot().filter(db => db.region === region);
  }

  selectByRegion(region: string): void {
    const list = this.snapshot().map(d => 
      d.region === region ? { ...d, selected: true } : d
    );
    this.emit(list);
  }

  clearByRegion(region: string): void {
    const list = this.snapshot().map(d => 
      d.region === region ? { ...d, selected: false } : d
    );
    this.emit(list);
  }

  isRegionFullySelected(region: string): boolean {
    const regionDbs = this.getDatabasesByRegion(region);
    return regionDbs.length > 0 && regionDbs.every(db => db.selected);
  }
}
