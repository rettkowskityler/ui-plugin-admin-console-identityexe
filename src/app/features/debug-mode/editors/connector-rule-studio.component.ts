import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { EditorTab } from '../debug-mode.models';
import { SyntaxHighlighterService, HighlightedLine } from '../syntax-highlighter.service';

interface RuleVariable {
  name: string;
  type?: string;
  description?: string;
}

interface RuleSnippet {
  name: string;
  code: string;
  description: string;
}

@Component({
  selector: 'app-connector-rule-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, TooltipModule, TagModule],
  templateUrl: './connector-rule-studio.component.html',
  styleUrl: './connector-rule-studio.component.scss',
})
export class ConnectorRuleStudioComponent {
  private readonly highlighter = inject(SyntaxHighlighterService);

  readonly tab = input.required<EditorTab>();
  readonly isEditMode = input<boolean>(false);
  readonly reloading = input<boolean>(false);
  readonly tenantOrg = input<string>('devrel-ga-25045');

  readonly tabChange = output<EditorTab>();
  readonly reviewDiff = output<void>();
  readonly reloadObject = output<void>();

  @ViewChild('scriptArea') scriptArea?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('jsonArea') jsonArea?: ElementRef<HTMLTextAreaElement>;

  protected readonly activeSubTab = signal<'script' | 'json'>('script');
  protected readonly copied = signal<boolean>(false);

  // Line-numbered syntax highlighted lines for Java / BeanShell source
  readonly highlightedScriptLines = computed<HighlightedLine[]>(() => {
    return this.highlighter.highlightToLines(this.tab().editedScript || '', 'java');
  });

  // Full real-time syntax highlighted HTML for live Java editing backdrop
  readonly highlightedScriptHtml = computed<string>(() => {
    const code = this.tab().editedScript || '';
    let html = this.highlighter.highlightJava(code);
    if (code.endsWith('\n')) {
      html += ' ';
    }
    return html;
  });

  // Line-numbered syntax highlighted lines for Full JSON Envelope
  readonly highlightedJsonLines = computed<HighlightedLine[]>(() => {
    return this.highlighter.highlightToLines(this.tab().editedCode || '', 'json');
  });

  // Full real-time syntax highlighted HTML for live JSON editing backdrop
  readonly highlightedJsonHtml = computed<string>(() => {
    const code = this.tab().editedCode || '';
    let html = this.highlighter.highlightJson(code);
    if (code.endsWith('\n')) {
      html += ' ';
    }
    return html;
  });


  copyCode(): void {
    const textToCopy =
      this.activeSubTab() === 'script'
        ? this.tab().editedScript || ''
        : this.tab().editedCode || '';
    navigator.clipboard.writeText(textToCopy);
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

  // Common Snippets for ISC Connector Rules
  protected readonly commonSnippets: RuleSnippet[] = [
    {
      name: 'Log Debug',
      description: 'Log statement with application context',
      code: 'log.debug("Executing rule for: " + (application != null ? application.getName() : "unknown"));',
    },
    {
      name: 'Parse JSON Map',
      description: 'Convert raw WebService response into Map',
      code: 'Map responseMap = (Map) JsonUtil.toMap(rawResponseObject);',
    },
    {
      name: 'JDBC BuildMap',
      description: 'Build Resource Object Map from ResultSet',
      code: 'HashMap map = JDBCConnector.buildMapFromResultSet(result, schema);\nreturn map;',
    },
    {
      name: 'Try / Catch Wrap',
      description: 'Standard exception handling with GeneralException',
      code: 'try {\n    // Implementation\n} catch (Exception e) {\n    log.error("Rule failure: " + e.getMessage(), e);\n    throw new GeneralException(e);\n}',
    },
    {
      name: 'Return Output Map',
      description: 'Assemble output data map',
      code: 'Map updatedMapInfo = new HashMap();\nupdatedMapInfo.put("data", accountList);\nreturn updatedMapInfo;',
    },
  ];

  // Signature variables extracted from raw rule
  protected readonly signatureVariables = computed<RuleVariable[]>(() => {
    const raw = this.tab().activeItem.rawJson as any;
    const inputs = raw?.signature?.input;
    if (Array.isArray(inputs)) {
      return inputs.map((inp: any) => ({
        name: inp.name || 'var',
        type: inp.type || 'Object',
        description: inp.description || '',
      }));
    }
    // Fallback standard SailPoint rule variables
    return [
      { name: 'log', type: 'org.apache.commons.logging.Log', description: 'Logger for diagnostics' },
      { name: 'context', type: 'sailpoint.api.SailPointContext', description: 'Context handle' },
      { name: 'application', type: 'sailpoint.object.Application', description: 'Target application' },
      { name: 'schema', type: 'sailpoint.object.Schema', description: 'Current schema' },
      { name: 'result', type: 'java.sql.ResultSet', description: 'JDBC result set' },
      { name: 'rawResponseObject', type: 'Object', description: 'Raw Web Services response payload' },
      { name: 'processedResponseObject', type: 'Object', description: 'Processed Web Services object' },
      { name: 'restClient', type: 'Object', description: 'REST Client handle' },
    ];
  });

  protected readonly ruleType = computed<string>(() => {
    const raw = this.tab().activeItem.rawJson as any;
    return raw?.type || 'Rule';
  });

  onScriptInput(newScript: string): void {
    const current = this.tab();
    let updatedCode = current.editedCode;

    try {
      const obj = JSON.parse(current.editedCode);
      if (!obj.sourceCode) obj.sourceCode = {};
      obj.sourceCode.script = newScript;
      updatedCode = JSON.stringify(obj, null, 2);
    } catch {
      // keep current editedCode if not parseable
    }

    const updatedTab: EditorTab = {
      ...current,
      editedScript: newScript,
      editedCode: updatedCode,
      isDirty: newScript !== (current.originalScript || '') || updatedCode !== current.originalCode,
    };
    this.tabChange.emit(updatedTab);
  }

  onJsonInput(newJson: string): void {
    const current = this.tab();
    let err = '';
    let extractedScript = current.editedScript;

    try {
      const parsed = JSON.parse(newJson);
      if (parsed?.sourceCode?.script !== undefined) {
        extractedScript = parsed.sourceCode.script;
      }
    } catch (e: any) {
      err = e.message || 'Invalid JSON syntax';
    }

    const updatedTab: EditorTab = {
      ...current,
      editedCode: newJson,
      editedScript: extractedScript,
      jsonError: err,
      isDirty: newJson !== current.originalCode,
    };
    this.tabChange.emit(updatedTab);
  }

  insertSnippet(snippet: string): void {
    setTimeout(() => {
      let activeTextarea: HTMLTextAreaElement | undefined;
      if (this.activeSubTab() === 'script') {
        activeTextarea = this.scriptArea?.nativeElement;
      } else {
        activeTextarea = this.jsonArea?.nativeElement;
      }

      if (!activeTextarea) {
        if (this.activeSubTab() === 'script') {
          this.onScriptInput((this.tab().editedScript || '') + '\n' + snippet);
        } else {
          this.onJsonInput(this.tab().editedCode + '\n' + snippet);
        }
        return;
      }

      this.insertAtCursor(activeTextarea, snippet);
    }, 0);
  }

  insertAtCursor(textarea: HTMLTextAreaElement, snippet: string): void {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = textarea.value;
    const before = current.substring(0, start);
    const after = current.substring(end);
    textarea.value = before + snippet + after;
    textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
    textarea.focus();

    if (this.activeSubTab() === 'script') {
      this.onScriptInput(textarea.value);
    } else {
      this.onJsonInput(textarea.value);
    }
  }

  handleKeyDown(event: KeyboardEvent, textarea: HTMLTextAreaElement): void {
    if (event.key === 'Tab') {
      event.preventDefault();
      this.insertAtCursor(textarea, '    ');
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

  getLineNumbers(text: string): number[] {
    const count = (text || '').split('\n').length;
    return Array.from({ length: Math.max(count, 1) }, (_, i) => i + 1);
  }
}
