
import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { SelectionService } from '../../services/selection.service';

@Component({
  selector: 'app-db-selector',
  templateUrl: './db-selector.component.html',
  styleUrls: ['./db-selector.component.scss']
})
export class DbSelectorComponent implements OnInit {
  data: Record<string, string> = {};
  selected = new Set<string>();
  allToggle = false;

  constructor(
    private http: HttpClient,
    private snack: MatSnackBar,
    private router: Router,
    private sel: SelectionService
  ) {}

  ngOnInit(): void {
    this.selected = new Set(this.sel.getDatabases());
    this.http.get<Record<string,string>>('assets/basesDeDatosJSON.json').subscribe({
      next: (d) => {
        this.data = d;
        // inicializa master toggle si todo está seleccionado
        const allCodes = Object.keys(this.data);
        this.allToggle = allCodes.every(c => this.selected.has(c));
      },
      error: () => this.snack.open('No se pudo cargar basesDeDatosJSON.json', 'OK', { duration: 3000 })
    });
  }

  toggleOne(code: string, checked: boolean) {
    if (checked) this.selected.add(code);
    else this.selected.delete(code);
    const allCodes = Object.keys(this.data);
    this.allToggle = allCodes.length > 0 && allCodes.every(c => this.selected.has(c));
  }

  toggleAll(checked: boolean) {
    this.allToggle = checked;
    if (checked) Object.keys(this.data).forEach(c => this.selected.add(c));
    else this.selected.clear();
  }

  saveAndBack() {
    this.sel.setDatabases(Array.from(this.selected));
    this.snack.open('Bases seleccionadas: ' + this.selected.size, 'OK', { duration: 1500 });
    this.router.navigate(['/dashboard']);
  }
}
