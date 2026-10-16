import { Injectable, computed, signal } from '@angular/core';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type LogLevel = 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' | 'DEBUG';
export type LogType = 'api' | 'event';

export interface ApiLogEntry {
  id: string;
  type: 'api';
  timestamp: Date;
  method: HttpMethod;
  url: string;
  path: string;
  status: number;
  statusText: string;
  durationMs: number;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  responseHeaders: Record<string, string>;
  responseBody?: unknown;
  error?: string;
  curl: string;
}

export interface EventLogEntry {
  id: string;
  type: 'event';
  timestamp: Date;
  level: LogLevel;
  category: string;
  message: string;
  details?: unknown;
}

export type LogItem = ApiLogEntry | EventLogEntry;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildCurlCommand(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: unknown
): string {
  const parts: string[] = [`curl -X ${method} "${url}"`];

  for (const [key, value] of Object.entries(headers)) {
    parts.push(`  -H "${key}: ${value}"`);
  }

  if (body !== undefined && body !== null && method !== 'GET') {
    const jsonStr = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    // Escape single quotes for bash
    parts.push(`  -d '${jsonStr.replace(/'/g, "'\\''")}'`);
  }

  return parts.join(' \\\n');
}

@Injectable({ providedIn: 'root' })
export class ApiLogService {
  private readonly MAX_LOGS = 500;

  readonly logs = signal<LogItem[]>([]);
  readonly recording = signal<boolean>(true);
  readonly selectedLogId = signal<string | null>(null);

  // Filters
  readonly methodFilter = signal<string>('ALL'); // ALL, GET, POST, PUT, PATCH, DELETE
  readonly statusFilter = signal<string>('ALL'); // ALL, 2xx, 4xx, 5xx, ERR
  readonly typeFilter = signal<string>('ALL'); // ALL, api, event
  readonly searchQuery = signal<string>('');

  // Computeds
  readonly filteredLogs = computed(() => {
    const list = this.logs();
    const method = this.methodFilter();
    const status = this.statusFilter();
    const type = this.typeFilter();
    const q = this.searchQuery().trim().toLowerCase();

    return list.filter((item) => {
      // Type filter
      if (type !== 'ALL' && item.type !== type) {
        return false;
      }

      // Method filter
      if (item.type === 'api') {
        if (method !== 'ALL' && item.method !== method) {
          return false;
        }

        // Status filter
        if (status !== 'ALL') {
          if (status === '2xx' && (item.status < 200 || item.status >= 300)) return false;
          if (status === '4xx' && (item.status < 400 || item.status >= 500)) return false;
          if (status === '5xx' && (item.status < 500 || item.status >= 600)) return false;
          if (status === 'ERR' && item.status !== 0 && item.status < 400) return false;
        }
      }

      // Text search
      if (q) {
        if (item.type === 'api') {
          const matchUrl = item.url.toLowerCase().includes(q);
          const matchPath = item.path.toLowerCase().includes(q);
          const matchStatus = String(item.status).includes(q) || item.statusText.toLowerCase().includes(q);
          const matchError = item.error ? item.error.toLowerCase().includes(q) : false;
          let matchBody = false;
          if (item.requestBody) {
            matchBody = JSON.stringify(item.requestBody).toLowerCase().includes(q);
          }
          let matchResp = false;
          if (item.responseBody) {
            matchResp = JSON.stringify(item.responseBody).toLowerCase().includes(q);
          }
          if (!matchUrl && !matchPath && !matchStatus && !matchError && !matchBody && !matchResp) {
            return false;
          }
        } else {
          const matchMsg = item.message.toLowerCase().includes(q);
          const matchCat = item.category.toLowerCase().includes(q);
          const matchLvl = item.level.toLowerCase().includes(q);
          if (!matchMsg && !matchCat && !matchLvl) {
            return false;
          }
        }
      }

      return true;
    });
  });

  readonly selectedLog = computed(() => {
    const id = this.selectedLogId();
    if (!id) return null;
    return this.logs().find((l) => l.id === id) ?? null;
  });

  readonly totalCount = computed(() => this.logs().length);

  readonly apiCount = computed(
    () => this.logs().filter((l) => l.type === 'api').length
  );

  readonly successCount = computed(
    () =>
      this.logs().filter(
        (l) => l.type === 'api' && l.status >= 200 && l.status < 300
      ).length
  );

  readonly clientErrorCount = computed(
    () =>
      this.logs().filter(
        (l) => l.type === 'api' && l.status >= 400 && l.status < 500
      ).length
  );

  readonly serverErrorCount = computed(
    () =>
      this.logs().filter(
        (l) => (l.type === 'api' && (l.status >= 500 || l.status === 0)) || (l.type === 'event' && l.level === 'ERROR')
      ).length
  );

  readonly errorCount = computed(
    () => this.clientErrorCount() + this.serverErrorCount()
  );

  readonly hasErrors = computed(() => this.errorCount() > 0);

  readonly averageDurationMs = computed(() => {
    const apiCalls = this.logs().filter((l): l is ApiLogEntry => l.type === 'api');
    if (apiCalls.length === 0) return 0;
    const sum = apiCalls.reduce((acc, c) => acc + c.durationMs, 0);
    return Math.round(sum / apiCalls.length);
  });

  logApiCall(entry: Omit<ApiLogEntry, 'id' | 'type' | 'timestamp'>): ApiLogEntry {
    if (!this.recording()) {
      return {
        ...entry,
        id: generateId(),
        type: 'api',
        timestamp: new Date(),
      };
    }

    const newEntry: ApiLogEntry = {
      ...entry,
      id: generateId(),
      type: 'api',
      timestamp: new Date(),
    };

    this.logs.update((current) => {
      const next = [newEntry, ...current];
      return next.length > this.MAX_LOGS ? next.slice(0, this.MAX_LOGS) : next;
    });

    if (!this.selectedLogId()) {
      this.selectedLogId.set(newEntry.id);
    }

    return newEntry;
  }

  logEvent(level: LogLevel, category: string, message: string, details?: unknown): EventLogEntry {
    if (!this.recording()) {
      return {
        id: generateId(),
        type: 'event',
        timestamp: new Date(),
        level,
        category,
        message,
        details,
      };
    }

    const newEntry: EventLogEntry = {
      id: generateId(),
      type: 'event',
      timestamp: new Date(),
      level,
      category,
      message,
      details,
    };

    this.logs.update((current) => {
      const next = [newEntry, ...current];
      return next.length > this.MAX_LOGS ? next.slice(0, this.MAX_LOGS) : next;
    });

    if (!this.selectedLogId()) {
      this.selectedLogId.set(newEntry.id);
    }

    return newEntry;
  }

  selectLog(id: string | null): void {
    this.selectedLogId.set(id);
  }

  clearLogs(): void {
    this.logs.set([]);
    this.selectedLogId.set(null);
  }

  toggleRecording(): void {
    this.recording.update((r) => !r);
  }

  exportLogsJson(): void {
    const data = JSON.stringify(this.logs(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `isc-debug-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
