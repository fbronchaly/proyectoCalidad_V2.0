import 'zone.js';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';
import { enableProdMode } from '@angular/core';
import { environment } from './environments/environment';


// SOLUCIÓN DEFINITIVA NG02100: Registrar locale globalmente antes del bootstrap
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
registerLocaleData(localeEs, 'es');

console.log('🚀 %c APP INICIALIZADA - VERSIÓN CON FIX LOCALE (v2)', 'background: #222; color: #bada55; font-size: 20px');

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => {
    console.error('Error al inicializar la aplicación:', err);
  });
