import { Component, OnInit } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { SelectionService } from '../../services/selection.service';
import { DatabaseService, DatabaseItem } from '../../services/database.service';

@Component({
  selector: 'app-db-selector',
  templateUrl: './db-selector.component.html',
  styleUrls: ['./db-selector.component.scss']
})
export class DbSelectorComponent implements OnInit {
  databases: DatabaseItem[] = [];
  regions: string[] = [];
  allToggle = false;

  constructor(
    private snack: MatSnackBar,
    private router: Router,
    private sel: SelectionService,
    private dbService: DatabaseService
  ) {}

  ngOnInit(): void {
    // Cargar regiones
    this.regions = this.dbService.getRegions();
    
    // Suscribirse a cambios en las bases de datos
    this.dbService.databases$.subscribe(databases => {
      this.databases = databases;
      this.updateAllToggle();
    });

    // Aplicar selección inicial desde SelectionService
    const selectedIds = this.sel.getDatabases();
    if (selectedIds.length > 0) {
      this.dbService.applySelection(selectedIds);
    }
  }

  private updateAllToggle(): void {
    this.allToggle = this.databases.length > 0 && this.databases.every(db => db.selected);
  }

  toggleOne(id: string): void {
    this.dbService.toggle(id);
  }

  toggleAll(): void {
    if (this.allToggle) {
      this.dbService.clear();
    } else {
      this.dbService.selectAll();
    }
  }

  clearAll(): void {
    this.dbService.clear();
    this.snack.open('Todas las bases deseleccionadas', 'OK', { duration: 1500 });
  }

  selectAllByRegion(region: string): void {
    this.dbService.selectByRegion(region);
    this.snack.open(`Seleccionadas todas las bases de ${region}`, 'OK', { duration: 1500 });
  }

  clearByRegion(region: string): void {
    this.dbService.clearByRegion(region);
    this.snack.open(`Deseleccionadas todas las bases de ${region}`, 'OK', { duration: 1500 });
  }

  isRegionFullySelected(region: string): boolean {
    return this.dbService.isRegionFullySelected(region);
  }

  getDatabasesByRegion(region: string): DatabaseItem[] {
    return this.databases.filter(db => db.region === region);
  }

  getSelectedCount(): number {
    return this.databases.filter(db => db.selected).length;
  }

  getSelectedCountByRegion(region: string): number {
    return this.getDatabasesByRegion(region).filter(db => db.selected).length;
  }

  getTotalCountByRegion(region: string): number {
    return this.getDatabasesByRegion(region).length;
  }

  hasNoSelectedInRegion(region: string): boolean {
    return this.getSelectedCountByRegion(region) === 0;
  }

  saveAndBack(): void {
    const selectedIds = this.databases.filter(db => db.selected).map(db => db.id);
    this.sel.setDatabases(selectedIds);
    this.dbService.saveSelection();
    this.snack.open(`Bases seleccionadas: ${selectedIds.length}`, 'OK', { duration: 1500 });
    this.router.navigate(['/dashboard']);
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}
