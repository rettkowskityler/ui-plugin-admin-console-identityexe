import { CommonModule } from '@angular/common';
import { Component, input, output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DiffResult } from '../debug-mode.models';

@Component({
  selector: 'app-diff-viewer',
  standalone: true,
  imports: [CommonModule, ButtonModule, TagModule, TooltipModule],
  templateUrl: './diff-viewer.component.html',
  styleUrl: './diff-viewer.component.scss',
})
export class DiffViewerComponent {
  readonly diff = input.required<DiffResult>();
  readonly objectName = input<string>('Object');
  readonly objectType = input<string>('Object Type');
  readonly tenantOrg = input<string>('devrel-ga-25045');

  readonly confirmChanges = output<void>();
  readonly cancel = output<void>();

  protected readonly viewMode = signal<'unified' | 'split'>('unified');
  protected readonly copied = signal<boolean>(false);

  copyDiff(): void {
    const rawLines = this.diff().lines.map((l) => {
      const prefix = l.type === 'added' ? '+ ' : l.type === 'removed' ? '- ' : '  ';
      return prefix + l.content;
    });
    navigator.clipboard.writeText(rawLines.join('\n'));
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }
}
