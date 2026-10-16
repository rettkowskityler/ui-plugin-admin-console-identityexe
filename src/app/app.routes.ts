import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/debug-mode/debug-mode.component').then(
        (m) => m.DebugModeComponent
      ),
  },
  {
    path: 'debug-mode',
    loadComponent: () =>
      import('./features/debug-mode/debug-mode.component').then(
        (m) => m.DebugModeComponent
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
