import { Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { SailpointPluginService, ThemeService } from '@core';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TagModule, TooltipModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly plugin = inject(SailpointPluginService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly themeService = inject(ThemeService);

  protected readonly title = signal('Administrator Console');
  protected readonly context = this.plugin.context;
  protected readonly status = this.plugin.status;
  protected readonly handshakeSeverity = {
    pending: 'warn',
    ready: 'success',
    failed: 'danger',
  } as const;

  protected readonly logoPath = computed(() =>
    this.themeService.theme() === 'dark'
      ? './branding/IdentityEXE2-06.svg'
      : './branding/IdentityEXE2-05.svg'
  );

  ngOnInit(): void {
    const initialSubPath = this.plugin.context()?.page.subPath ?? '';
    let initialNavigationHandled = false;

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        const hashPath = event.urlAfterRedirects.replace(/^\/#?\/?/, '');

        if (!initialNavigationHandled) {
          initialNavigationHandled = true;
          if (initialSubPath && initialSubPath !== hashPath) {
            this.router.navigateByUrl(`/${initialSubPath}`);
          }
          return;
        }

        if (this.plugin.apiReady()) {
          this.plugin.setRoute(hashPath).catch((err) => {
            console.warn('[plugin] Failed to report route change to host.', err);
          });
        }
      });
  }
}
