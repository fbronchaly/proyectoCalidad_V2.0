import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { DbSelectorComponent } from './components/db-selector/db-selector.component';
import { IndicadoresSelectorComponent } from './components/indicadores-selector/indicadores-selector.component';
import { LoginComponent } from './components/login/login.component';
import { RegistroComponent } from './components/registro/registro.component';

const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'registro', component: RegistroComponent },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'bases', component: DbSelectorComponent },
  { path: 'indicadores', component: IndicadoresSelectorComponent },
  { path: '**', redirectTo: 'login' }
];




@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
