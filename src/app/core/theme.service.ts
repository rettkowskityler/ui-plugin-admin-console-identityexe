import { Injectable, effect, signal } from '@angular/core';

export type AppTheme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'isc-debug-theme';

  readonly theme = signal<AppTheme>(this.getInitialTheme());

  constructor() {
    effect(() => {
      const current = this.theme();
      try {
        localStorage.setItem(this.STORAGE_KEY, current);
      } catch {
        // ignore storage errors
      }

      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', current);
        document.documentElement.classList.remove('theme-dark', 'theme-light', 'spds-dark', 'spds-light');
        document.body.classList.remove('theme-dark', 'theme-light', 'spds-dark', 'spds-light');

        document.documentElement.classList.add(`theme-${current}`);
        document.body.classList.add(`theme-${current}`);

        if (current === 'dark') {
          document.documentElement.classList.add('spds-dark');
          document.body.classList.add('spds-dark');
        } else {
          document.documentElement.classList.add('spds-light');
          document.body.classList.add('spds-light');
        }
      }
    });

    // Listen for storage events (e.g. if updated in another tab)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === this.STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
          this.theme.set(e.newValue);
        }
      });
    }
  }

  private getInitialTheme(): AppTheme {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch {
      // ignore
    }

    // Default to system preference if available, else dark
    if (typeof window !== 'undefined' && window.matchMedia) {
      if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
    }

    return 'dark';
  }

  toggleTheme(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  setTheme(newTheme: AppTheme): void {
    this.theme.set(newTheme);
  }
}
