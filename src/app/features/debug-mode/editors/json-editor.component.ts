import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { EditorTab } from '../debug-mode.models';
import { SyntaxHighlighterService, HighlightedLine } from '../syntax-highlighter.service';

@Component({
  selector: 'app-json-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TagModule, TooltipModule],
  templateUrl: './json-editor.component.html',
  styleUrl: './json-editor.component.scss',
})
export class JsonEditorComponent {
  private readonly highlighter = inject(SyntaxHighlighterService);

  readonly tab = input.required<EditorTab>();
  readonly isEditMode = input<boolean>(false);
  readonly reloading = input<boolean>(false);

  readonly tabChange = output<EditorTab>();
  readonly reviewDiff = output<void>();
  readonly reloadObject = output<void>();

  protected readonly copied = signal<boolean>(false);

  // Line numbers for gutter
  getLineNumbers(text: string): number[] {
    const count = (text || '').split('\n').length;
    return Array.from({ length: Math.max(count, 1) }, (_, i) => i + 1);
  }

  // Highlighted lines for syntax view & split view
  readonly highlightedLines = computed<HighlightedLine[]>(() => {
    return this.highlighter.highlightToLines(this.tab().editedCode, 'json');
  });

  // Full real-time syntax highlighted HTML for live editing backdrop
  readonly highlightedCodeHtml = computed<string>(() => {
    const code = this.tab().editedCode || '';
    let html = this.highlighter.highlightJson(code);
    if (code.endsWith('\n')) {
      html += ' ';
    }
    return html;
  });


  onJsonInput(newCode: string): void {
    let err = '';
    try {
      JSON.parse(newCode);
    } catch (e) {
      err = (e as Error).message;
    }

    const currentTab = this.tab();
    const updatedTab: EditorTab = {
      ...currentTab,
      editedCode: newCode,
      isDirty: newCode !== currentTab.originalCode,
      jsonError: err,
    };
    this.tabChange.emit(updatedTab);
  }

  formatJson(): void {
    try {
      const parsed = JSON.parse(this.tab().editedCode);
      const formatted = JSON.stringify(parsed, null, 2);
      this.onJsonInput(formatted);
    } catch {
      // Keep existing code if invalid
    }
  }

  minifyJson(): void {
    try {
      const parsed = JSON.parse(this.tab().editedCode);
      const minified = JSON.stringify(parsed);
      this.onJsonInput(minified);
    } catch {
      // Keep existing code if invalid
    }
  }

  copyJson(): void {
    navigator.clipboard.writeText(this.tab().editedCode);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  syncEditScroll(textarea: HTMLTextAreaElement, backdrop?: HTMLElement, gutter?: HTMLElement): void {
    if (backdrop) {
      backdrop.scrollTop = textarea.scrollTop;
      backdrop.scrollLeft = textarea.scrollLeft;
    }
    if (gutter) {
      gutter.scrollTop = textarea.scrollTop;
    }
  }

  handleKeyDown(event: KeyboardEvent, textarea: HTMLTextAreaElement): void {
    if (event.key === 'Tab') {
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      const tabStr = '  ';
      textarea.value = val.substring(0, start) + tabStr + val.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + tabStr.length;
      this.onJsonInput(textarea.value);
    }
  }
}
