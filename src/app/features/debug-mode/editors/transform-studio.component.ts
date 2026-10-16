import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { EditorTab, IdentityPreviewResult, PreviewIdentityOption } from '../debug-mode.models';
import { DebugModeApiService } from '../debug-mode-api.service';
import { SyntaxHighlighterService, HighlightedLine } from '../syntax-highlighter.service';
import { TransformSimulatorService, SimulationResult } from '../transform-simulator.service';

@Component({
  selector: 'app-transform-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TooltipModule],
  templateUrl: './transform-studio.component.html',
  styleUrl: './transform-studio.component.scss',
})
export class TransformStudioComponent implements OnInit {
  private readonly simulator = inject(TransformSimulatorService);
  private readonly apiService = inject(DebugModeApiService);
  private readonly highlighter = inject(SyntaxHighlighterService);

  readonly tab = input.required<EditorTab>();
  readonly isEditMode = input<boolean>(false);
  readonly reloading = input<boolean>(false);
  readonly tenantOrg = input<string>('devrel-ga-25045');

  readonly tabChange = output<EditorTab>();
  readonly reviewDiff = output<void>();
  readonly reloadObject = output<void>();

  // Preview Mode: 'previewApi' (Default) or 'clientSide'
  protected readonly simulatorMode = signal<'previewApi' | 'clientSide'>('previewApi');

  // Identity Preview State
  protected readonly identities = signal<PreviewIdentityOption[]>([]);
  protected readonly loadingIdentities = signal<boolean>(false);
  protected readonly selectedIdentityId = signal<string>('');
  protected readonly selectedAttribute = signal<string>('displayName');
  protected readonly identitySearchQuery = signal<string>('');
  protected readonly dropdownOpen = signal<boolean>(false);
  protected readonly previewing = signal<boolean>(false);
  protected readonly previewResult = signal<IdentityPreviewResult | null>(null);

  // Client-Side Fallback Inputs
  protected readonly testInputKey = signal<string>('input');
  protected readonly testInputValue = signal<string>('John.Doe');
  protected readonly testJsonAttributes = signal<string>(
    '{\n  "firstname": "John",\n  "lastname": "Doe",\n  "uid": "jdoe"\n}'
  );
  protected readonly simulationResult = signal<SimulationResult | null>(null);

  readonly standardAttributes = [
    { label: 'Display Name (displayName)', value: 'displayName' },
    { label: 'Work Email (email)', value: 'email' },
    { label: 'User ID (uid)', value: 'uid' },
    { label: 'First Name (firstname)', value: 'firstname' },
    { label: 'Last Name (lastname)', value: 'lastname' },
    { label: 'Job Title (jobTitle)', value: 'jobTitle' },
    { label: 'Department (department)', value: 'department' },
    { label: 'Location (location)', value: 'location' },
    { label: 'Phone (phone)', value: 'phone' },
    { label: 'Lifecycle State (cloudLifecycleState)', value: 'cloudLifecycleState' },
  ];

  protected readonly transformType = computed<string>(() => {
    const raw = this.tab().activeItem.rawJson as any;
    return raw?.type || 'static';
  });

  protected readonly isInternal = computed<boolean>(() => {
    const raw = this.tab().activeItem.rawJson as any;
    return raw?.internal === true;
  });

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

  readonly filteredIdentities = computed(() => {
    const q = this.identitySearchQuery().trim().toLowerCase();
    const all = this.identities();
    if (!q) return all;
    return all.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.email && i.email.toLowerCase().includes(q)) ||
        i.id.toLowerCase().includes(q)
    );
  });

  readonly selectedIdentity = computed(() => {
    const id = this.selectedIdentityId();
    return this.identities().find((i) => i.id === id) || null;
  });

  ngOnInit(): void {
    this.loadIdentities();
  }

  async loadIdentities(): Promise<void> {
    this.loadingIdentities.set(true);
    try {
      const list = await this.apiService.fetchPreviewIdentities(100);
      this.identities.set(list);
      if (list.length > 0 && !this.selectedIdentityId()) {
        this.selectedIdentityId.set(list[0].id);
      }
    } catch (err) {
      console.warn('Failed to load identities for transform preview:', err);
    } finally {
      this.loadingIdentities.set(false);
    }
  }

  selectIdentity(identity: PreviewIdentityOption): void {
    this.selectedIdentityId.set(identity.id);
    this.dropdownOpen.set(false);
    this.identitySearchQuery.set('');
  }

  toggleDropdown(): void {
    this.dropdownOpen.set(!this.dropdownOpen());
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  async runIdentityPreview(): Promise<void> {
    const id = this.selectedIdentityId();
    if (!id) return;

    this.previewing.set(true);
    this.previewResult.set(null);

    try {
      const transformName = this.tab().activeItem.name || this.tab().objectId;
      const res = await this.apiService.previewTransformOnIdentity(
        id,
        transformName,
        this.selectedAttribute()
      );
      this.previewResult.set(res);
    } finally {
      this.previewing.set(false);
    }
  }

  onJsonInput(val: string): void {
    const current = this.tab();
    let err = '';
    try {
      JSON.parse(val);
    } catch (e: any) {
      err = e.message || 'Invalid JSON syntax';
    }

    const updatedTab: EditorTab = {
      ...current,
      editedCode: val,
      jsonError: err,
      isDirty: val !== current.originalCode,
    };
    this.tabChange.emit(updatedTab);
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
      const current = textarea.value;
      textarea.value = current.substring(0, start) + '  ' + current.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      this.onJsonInput(textarea.value);
    }
  }

  formatJson(): void {
    const current = this.tab();
    try {
      const parsed = JSON.parse(current.editedCode);
      const formatted = JSON.stringify(parsed, null, 2);
      this.onJsonInput(formatted);
    } catch {}
  }

  minifyJson(): void {
    const current = this.tab();
    try {
      const parsed = JSON.parse(current.editedCode);
      const minified = JSON.stringify(parsed);
      this.onJsonInput(minified);
    } catch {}
  }

  runClientSimulation(): void {
    let mockInputs: Record<string, string> = {};
    try {
      mockInputs = JSON.parse(this.testJsonAttributes());
    } catch {
      mockInputs[this.testInputKey()] = this.testInputValue();
    }

    try {
      const transformDef = JSON.parse(this.tab().editedCode);
      const res = this.simulator.simulate(transformDef, mockInputs);
      this.simulationResult.set(res);
    } catch (e: any) {
      this.simulationResult.set({
        output: '',
        steps: [`JSON Parse Error: ${e.message}`],
        success: false,
        error: e.message,
      });
    }
  }

  getLineNumbers(text: string): number[] {
    const count = (text || '').split('\n').length;
    return Array.from({ length: Math.max(count, 1) }, (_, i) => i + 1);
  }
}
