import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideSailPoint } from '@sailpoint/angular-sdk';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { providePrimeNG } from 'primeng/config';
import { firstValueFrom } from 'rxjs';

import { SailpointPluginService, spdsPrimePreset, SPDS_DARK_MODE_SELECTOR, SPDS_THEME_PREFIX } from '@core';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withHashLocation()),
    provideSailPoint(),
    providePrimeNG({
      theme: {
        preset: spdsPrimePreset,
        options: { darkModeSelector: SPDS_DARK_MODE_SELECTOR, prefix: SPDS_THEME_PREFIX },
      },
    }),
    provideTranslateService({
      fallbackLang: 'en',
      loader: provideTranslateHttpLoader({
        prefix: 'i18n/',
        suffix: '.json',
        useHttpBackend: true,
      }),
    }),
    provideAppInitializer(async () => {
      try {
        await inject(SailpointPluginService).whenReady();
      } catch (err) {
        console.warn('[plugin] App Shell handshake did not complete during startup.', err);
      }
    }),
    provideAppInitializer(async () => {
      const translate = inject(TranslateService);
      try {
        await firstValueFrom(translate.use(navigator.language));
      } catch (err) {
        console.warn('[plugin] Failed to load translations during startup.', err);
      }
    })
  ]
};
