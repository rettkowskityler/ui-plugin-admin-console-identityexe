import { CommonModule } from '@angular/common';
import { Component, computed, EventEmitter, inject, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TooltipModule } from 'primeng/tooltip';
import { ApiLogEntry, ApiLogService, EventLogEntry, LogItem } from '@core';

@Component({
  selector: 'app-log-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, TooltipModule],
  templateUrl: './log-viewer.component.html',
  styleUrl: './log-viewer.component.scss',
})
export class LogViewerComponent {
  protected readonly apiLog = inject(ApiLogService);

  @Output() backToExplorer = new EventEmitter<void>();

  // Active Inspector Sub-Tab
  readonly inspectorTab = signal<'response' | 'request' | 'curl' | 'headers'>('response');
  readonly maskAuthHeader = signal<boolean>(true);
  readonly copyFeedback = signal<string | null>(null);
  readonly responseFilter = signal<string>('');

  // Selected Log casting helpers
  readonly selectedApiLog = computed<ApiLogEntry | null>(() => {
    const item = this.apiLog.selectedLog();
    return item && item.type === 'api' ? item : null;
  });

  readonly selectedEventLog = computed<EventLogEntry | null>(() => {
    const item = this.apiLog.selectedLog();
    return item && item.type === 'event' ? item : null;
  });

  // Prettified JSON cache
  readonly formattedRequestBody = computed<string>(() => {
    const log = this.selectedApiLog();
    if (!log || log.requestBody === undefined || log.requestBody === null) {
      return '';
    }
    return this.prettyPrint(log.requestBody);
  });

  readonly formattedResponseBody = computed<string>(() => {
    const log = this.selectedApiLog();
    if (!log || log.responseBody === undefined || log.responseBody === null) {
      return '';
    }
    return this.prettyPrint(log.responseBody);
  });

  readonly filteredResponseBody = computed<string>(() => {
    const body = this.formattedResponseBody();
    const q = this.responseFilter().trim().toLowerCase();
    if (!q || !body) return body;
    const lines = body.split('\n');
    return lines.filter((l) => l.toLowerCase().includes(q)).join('\n');
  });

  // Headers list as array for easy rendering
  readonly requestHeadersList = computed<{ key: string; value: string }[]>(() => {
    const log = this.selectedApiLog();
    if (!log || !log.requestHeaders) return [];
    return Object.entries(log.requestHeaders).map(([key, value]) => {
      let displayVal = value;
      if (this.maskAuthHeader() && key.toLowerCase() === 'authorization' && value.startsWith('Bearer ')) {
        const token = value.slice(7);
        displayVal = `Bearer ${token.slice(0, 10)}...${token.slice(-6)} (masked)`;
      }
      return { key, value: displayVal };
    });
  });

  readonly responseHeadersList = computed<{ key: string; value: string }[]>(() => {
    const log = this.selectedApiLog();
    if (!log || !log.responseHeaders) return [];
    return Object.entries(log.responseHeaders).map(([key, value]) => ({ key, value }));
  });

  private prettyPrint(val: unknown): string {
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return val;
      }
    }
    return JSON.stringify(val, null, 2);
  }

  selectItem(item: LogItem): void {
    this.apiLog.selectLog(item.id);
  }

  setMethodFilter(method: string): void {
    this.apiLog.methodFilter.set(method);
  }

  setStatusFilter(status: string): void {
    this.apiLog.statusFilter.set(status);
  }

  setTypeFilter(type: string): void {
    this.apiLog.typeFilter.set(type);
  }

  clearSearch(): void {
    this.apiLog.searchQuery.set('');
  }

  clearLogs(): void {
    this.apiLog.clearLogs();
  }

  toggleRecording(): void {
    this.apiLog.toggleRecording();
  }

  exportLogs(): void {
    this.apiLog.exportLogsJson();
  }

  toggleMaskAuth(): void {
    this.maskAuthHeader.update((m) => !m);
  }

  async copyText(text: string, label: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copyFeedback.set(label);
      setTimeout(() => {
        if (this.copyFeedback() === label) {
          this.copyFeedback.set(null);
        }
      }, 2500);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.copyFeedback.set(label);
      setTimeout(() => this.copyFeedback.set(null), 2500);
    }
  }

  formatTime(date: Date): string {
    if (!date) return '';
    const d = new Date(date);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  getMethodClass(method: string): string {
    switch (method.toUpperCase()) {
      case 'GET':
        return 'method-get';
      case 'POST':
        return 'method-post';
      case 'PUT':
        return 'method-put';
      case 'PATCH':
        return 'method-patch';
      case 'DELETE':
        return 'method-delete';
      default:
        return 'method-default';
    }
  }

  getStatusClass(status: number): string {
    if (status >= 200 && status < 300) return 'status-2xx';
    if (status >= 300 && status < 400) return 'status-3xx';
    if (status >= 400 && status < 500) return 'status-4xx';
    if (status >= 500 || status === 0) return 'status-5xx';
    return 'status-default';
  }

  getLevelClass(level: string): string {
    switch (level.toUpperCase()) {
      case 'SUCCESS':
        return 'level-success';
      case 'INFO':
        return 'level-info';
      case 'WARN':
        return 'level-warn';
      case 'ERROR':
        return 'level-error';
      case 'DEBUG':
        return 'level-debug';
      default:
        return 'level-default';
    }
  }

  getLatencyClass(ms: number): string {
    if (ms < 250) return 'latency-fast';
    if (ms < 750) return 'latency-medium';
    return 'latency-slow';
  }
}
