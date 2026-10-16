import { CommonModule } from '@angular/common';
import { Component, computed, HostListener, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ApiLogService, SailpointPluginService, ThemeService } from '@core';
import { DebugModeApiService } from './debug-mode-api.service';
import { DiffEngineService } from './diff-engine.service';
import { DiffViewerComponent } from './diff-viewer/diff-viewer.component';
import { ConnectorRuleStudioComponent } from './editors/connector-rule-studio.component';
import { TransformStudioComponent } from './editors/transform-studio.component';
import { JsonEditorComponent } from './editors/json-editor.component';
import { LogViewerComponent } from './log-viewer/log-viewer.component';
import {
  DiffResult,
  EditorTab,
  ISC_OBJECT_TYPES,
  IscObjectItem,
  IscObjectType,
  NEW_OBJECT_TEMPLATES,
  SP_CONFIG_EXPORT_TYPES,
  SpConfigTypeOption,
  SourceAssociatedObjects,
  TrackedTask,
} from './debug-mode.models';

@Component({
  selector: 'app-debug-mode',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    ProgressBarModule,
    SkeletonModule,
    ToastModule,
    TooltipModule,
    DiffViewerComponent,
    ConnectorRuleStudioComponent,
    TransformStudioComponent,
    JsonEditorComponent,
    LogViewerComponent,
  ],
  providers: [MessageService, DebugModeApiService, DiffEngineService],
  templateUrl: './debug-mode.component.html',
  styleUrl: './debug-mode.component.scss',
})
export class DebugModeComponent implements OnInit, OnDestroy {
  private readonly plugin = inject(SailpointPluginService);
  private readonly apiService = inject(DebugModeApiService);
  private readonly diffEngine = inject(DiffEngineService);
  private readonly messageService = inject(MessageService);
  protected readonly themeService = inject(ThemeService);
  protected readonly apiLogService = inject(ApiLogService);

  // Top-Level Active Workbench View ('explorer' | 'logs')
  readonly activeView = signal<'explorer' | 'logs'>('explorer');

  // Available ISC Object Types
  readonly objectTypes = ISC_OBJECT_TYPES;

  // Tree & Explorer State
  readonly expandedTypeKeys = signal<Set<string>>(new Set());
  readonly typeItemsMap = signal<Map<string, IscObjectItem[]>>(new Map());
  readonly typeCountsMap = signal<Map<string, number>>(new Map());
  readonly loadingTypeMap = signal<Map<string, boolean>>(new Map());
  readonly loadingMoreTypeMap = signal<Map<string, boolean>>(new Map());
  readonly explorerFilter = signal<string>('');
  readonly sidebarOpen = signal<boolean>(true);
  readonly sidebarWidth = signal<number>(320);
  readonly isResizingSidebar = signal<boolean>(false);

  // Source Associated Objects State
  readonly sourceAssociatedMap = signal<Map<string, SourceAssociatedObjects>>(new Map());
  readonly expandedSourceIds = signal<Set<string>>(new Set());
  readonly loadingSourceAssocMap = signal<Map<string, boolean>>(new Map());
  readonly openSubgroupsMap = signal<Map<string, Set<string>>>(new Map());

  // Tabs & Workspace State
  readonly tabs = signal<EditorTab[]>([]);
  readonly activeTabId = signal<string | null>(null);

  readonly activeTab = computed<EditorTab | null>(() => {
    const currentId = this.activeTabId();
    if (!currentId) return null;
    return this.tabs().find((t) => t.id === currentId) || null;
  });

  // Diff Modal State
  readonly diffDialogVisible = signal<boolean>(false);
  readonly diffTab = signal<EditorTab | null>(null);
  readonly currentDiff = signal<DiffResult | null>(null);
  readonly saving = signal<boolean>(false);

  // Source Operations State
  readonly activeSourceDropdown = signal<'aggregate' | 'reset' | 'diagnostics' | 'data' | null>(null);
  readonly resetDialogVisible = signal<boolean>(false);
  readonly resettingSource = signal<boolean>(false);
  readonly resetAction = signal<
    'accounts' | 'entitlements' | 'source' | 'aggregate-accounts' | 'aggregate-entitlements' | 'aggregate-accounts-no-opt'
  >('accounts');
  readonly resetTargetTab = signal<EditorTab | null>(null);

  // Diagnostics & Peek State
  readonly testingConnection = signal<boolean>(false);
  readonly peekDialogVisible = signal<boolean>(false);
  readonly peekResults = signal<any[]>([]);
  readonly peekingObjects = signal<boolean>(false);
  readonly loggingDialogVisible = signal<boolean>(false);
  readonly loggingDurationMinutes = signal<number>(30);

  // Global View / Edit Mode State
  readonly isEditMode = signal<boolean>(false);
  readonly reloadingTab = signal<boolean>(false);

  // CRUD Dialogs State
  readonly newResourceDialogVisible = signal<boolean>(false);
  readonly newResourceType = signal<IscObjectType | null>(null);
  readonly newResourceName = signal<string>('');
  readonly newResourceSourceId = signal<string>('');
  readonly modalSources = signal<Array<{ id: string; name: string }>>([]);
  readonly isLoadingSourcesForModal = signal<boolean>(false);
  readonly creatingResource = signal<boolean>(false);

  readonly deleteDialogVisible = signal<boolean>(false);
  readonly deleteTargetType = signal<IscObjectType | null>(null);
  readonly deleteTargetItem = signal<IscObjectItem | null>(null);
  readonly deleteConfirmInput = signal<string>('');
  readonly isDeleting = signal<boolean>(false);

  readonly cloneDialogVisible = signal<boolean>(false);
  readonly cloneTargetType = signal<IscObjectType | null>(null);
  readonly cloneTargetItem = signal<IscObjectItem | null>(null);
  readonly cloneNewName = signal<string>('');
  readonly isCloning = signal<boolean>(false);

  // Workflow Dialogs State
  readonly workflowTestDialogVisible = signal<boolean>(false);
  readonly workflowTestInput = signal<string>('{\n  "input": "test-data"\n}');
  readonly workflowTestResult = signal<any>(null);
  readonly testingWorkflow = signal<boolean>(false);

  readonly workflowHistoryDialogVisible = signal<boolean>(false);
  readonly workflowExecutions = signal<any[]>([]);
  readonly loadingWorkflowHistory = signal<boolean>(false);

  // Identity Console Dialogs State
  readonly identityAccessDialogVisible = signal<boolean>(false);
  readonly identityAccess = signal<{ roles: any[]; accessProfiles: any[]; entitlements: any[] }>({
    roles: [],
    accessProfiles: [],
    entitlements: [],
  });
  readonly loadingIdentityAccess = signal<boolean>(false);

  readonly identityEventsDialogVisible = signal<boolean>(false);
  readonly identityEvents = signal<any[]>([]);
  readonly loadingIdentityEvents = signal<boolean>(false);

  readonly identityAccountsDialogVisible = signal<boolean>(false);
  readonly identityAccounts = signal<any[]>([]);
  readonly loadingIdentityAccounts = signal<boolean>(false);

  // SP-Config Dialogs State
  readonly spConfigDialogVisible = signal<boolean>(false);
  readonly spConfigMode = signal<'export' | 'import'>('export');
  readonly spConfigExportTypeOptions = SP_CONFIG_EXPORT_TYPES;
  readonly spConfigExportTypes = signal<string[]>(['SOURCE', 'TRANSFORM', 'RULE', 'WORKFLOW', 'ROLE', 'ACCESS_PROFILE']);
  readonly isRunningSpConfig = signal<boolean>(false);
  private spConfigPollTimer: any = null;
  readonly spConfigImportContent = signal<string>('');
  readonly spConfigImportPreview = signal<boolean>(true);
  readonly spConfigResult = signal<any>(null);

  // Notification Template Dialogs State
  readonly testEmailDialogVisible = signal<boolean>(false);
  readonly testEmailRecipient = signal<string>('');
  readonly sendingTestEmail = signal<boolean>(false);


  // Task Tracker State
  readonly trackedTasks = signal<TrackedTask[]>([]);
  readonly tasksDialogVisible = signal<boolean>(false);
  private taskPollTimer: any = null;

  // Tenant Information (Dynamic resolution)
  readonly tenantOrg = computed<string>(() => {
    return this.plugin.getTenantOrg();
  });

  readonly tenantUiUrl = computed<string>(() => {
    return this.plugin.getTenantUiUrl();
  });

  ngOnInit(): void {
    try {
      const saved = localStorage.getItem('identityexe_sidebar_width');
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 220 && parsed <= 1400) {
          this.sidebarWidth.set(parsed);
        }
      }
    } catch {}

    this.loadAllCounts();
    this.startTaskPolling();
  }

  ngOnDestroy(): void {
    if (this.taskPollTimer) {
      clearInterval(this.taskPollTimer);
    }
    if (this.spConfigPollTimer) {
      clearInterval(this.spConfigPollTimer);
    }
  }

  // ==========================================================================
  // Explorer Tree & Counts
  // ==========================================================================

  async loadAllCounts(): Promise<void> {
    const countPromises = this.objectTypes.map(async (type) => {
      try {
        const count = await this.apiService.fetchObjectCount(type);
        this.typeCountsMap.update((m) => {
          const next = new Map(m);
          next.set(type.key, count);
          return next;
        });
      } catch (err) {
        console.warn(`Could not load count for ${type.label}:`, err);
      }
    });

    await Promise.allSettled(countPromises);
  }

  getTypeCount(key: string): number | null {
    if (this.typeCountsMap().has(key)) {
      return this.typeCountsMap().get(key)!;
    }
    if (this.typeItemsMap().has(key)) {
      return this.typeItemsMap().get(key)!.length;
    }
    return null;
  }

  getLoadedCount(key: string): number {
    return (this.typeItemsMap().get(key) || []).length;
  }

  hasMoreItems(key: string): boolean {
    const loaded = this.getLoadedCount(key);
    const total = this.typeCountsMap().get(key) ?? 0;
    return loaded < total;
  }

  isTypeExpanded(key: string): boolean {
    return this.expandedTypeKeys().has(key);
  }

  toggleTypeExpanded(key: string): void {
    const nextSet = new Set(this.expandedTypeKeys());
    if (nextSet.has(key)) {
      nextSet.delete(key);
    } else {
      nextSet.add(key);
      if (!this.typeItemsMap().has(key)) {
        this.loadTypeItems(key, false);
      }
    }
    this.expandedTypeKeys.set(nextSet);
  }

  async loadTypeItems(key: string, append = false): Promise<void> {
    const objType = this.objectTypes.find((t) => t.key === key);
    if (!objType) return;

    if (append) {
      const map = new Map(this.loadingMoreTypeMap());
      map.set(key, true);
      this.loadingMoreTypeMap.set(map);
    } else {
      const map = new Map(this.loadingTypeMap());
      map.set(key, true);
      this.loadingTypeMap.set(map);
    }

    try {
      const currentItems = append ? (this.typeItemsMap().get(key) || []) : [];
      const offset = currentItems.length;
      const res = await this.apiService.fetchObjects(objType, offset, 100, this.explorerFilter());

      const nextItems = append ? [...currentItems, ...res.items] : res.items;
      const itemsNext = new Map(this.typeItemsMap());
      itemsNext.set(key, nextItems);
      this.typeItemsMap.set(itemsNext);

      // Preserve totalCount without capping to items.length (Fixes Issue #1)
      if (res.totalCount !== undefined && !isNaN(res.totalCount)) {
        this.typeCountsMap.update((m) => {
          const next = new Map(m);
          next.set(key, res.totalCount!);
          return next;
        });
      }
    } catch (err) {
      console.error(`Failed to load ${objType.label}:`, err);
      this.messageService.add({
        severity: 'error',
        summary: `Load Failed: ${objType.label}`,
        detail: `Could not fetch objects from tenant: ${(err as Error).message}`,
        life: 5000,
      });
    } finally {
      if (append) {
        const map = new Map(this.loadingMoreTypeMap());
        map.set(key, false);
        this.loadingMoreTypeMap.set(map);
      } else {
        const map = new Map(this.loadingTypeMap());
        map.set(key, false);
        this.loadingTypeMap.set(map);
      }
    }
  }

  async loadMoreItems(key: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.loadTypeItems(key, true);
  }

  async refreshType(key: string, event?: Event): Promise<void> {
    if (event) event.stopPropagation();
    const objType = this.objectTypes.find((t) => t.key === key);
    if (!objType) return;

    const count = await this.apiService.fetchObjectCount(objType);
    this.typeCountsMap.update((m) => {
      const next = new Map(m);
      next.set(key, count);
      return next;
    });

    if (this.isTypeExpanded(key)) {
      await this.loadTypeItems(key, false);
    }
  }

  getTypeItems(key: string): IscObjectItem[] {
    const raw = this.typeItemsMap().get(key) || [];
    const query = this.explorerFilter().trim().toLowerCase();
    if (!query) return raw;

    return raw.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query) ||
        (item.type && item.type.toLowerCase().includes(query))
    );
  }

  isTypeLoading(key: string): boolean {
    return this.loadingTypeMap().get(key) === true;
  }

  isTypeLoadingMore(key: string): boolean {
    return this.loadingMoreTypeMap().get(key) === true;
  }

  // ==========================================================================
  // Tab Management
  // ==========================================================================

  openObjectTab(objType: IscObjectType, item: IscObjectItem): void {
    const tabId = `${objType.key}:${item.id}`;
    const existing = this.tabs().find((t) => t.id === tabId);

    this.activeView.set('explorer');
    this.apiLogService.logEvent('INFO', 'Workspace', `Opened "${item.name || item.id}" [${objType.label}]`);

    if (existing) {
      this.activeTabId.set(tabId);
      return;
    }

    const formattedCode = JSON.stringify(item.rawJson, null, 2);
    let scriptContent = '';

    if (objType.key === 'connector-rules') {
      const sourceCode = (item.rawJson['sourceCode'] as Record<string, unknown>) || {};
      scriptContent = typeof sourceCode['script'] === 'string' ? sourceCode['script'] : '';
    }

    const newTab: EditorTab = {
      id: tabId,
      objectId: item.id,
      name: item.name || item.id,
      objectType: objType,
      activeItem: item,
      originalCode: formattedCode,
      editedCode: formattedCode,
      originalScript: scriptContent,
      editedScript: scriptContent,
      isDirty: false,
      activeSubTab: objType.key === 'connector-rules' ? 'script' : 'editor',
      jsonError: '',
    };

    this.tabs.update((list) => [...list, newTab]);
    this.activeTabId.set(tabId);
  }

  selectTab(tabId: string): void {
    this.activeTabId.set(tabId);
  }

  closeTab(tabId: string, event?: MouseEvent): void {
    if (event) event.stopPropagation();

    const currentTabs = this.tabs();
    const closeIndex = currentTabs.findIndex((t) => t.id === tabId);
    if (closeIndex === -1) return;

    const nextTabs = currentTabs.filter((t) => t.id !== tabId);
    this.tabs.set(nextTabs);

    if (this.activeTabId() === tabId) {
      if (nextTabs.length > 0) {
        const nextActive = nextTabs[Math.min(closeIndex, nextTabs.length - 1)];
        this.activeTabId.set(nextActive.id);
      } else {
        this.activeTabId.set(null);
      }
    }
  }

  closeAllTabs(): void {
    this.tabs.set([]);
    this.activeTabId.set(null);
  }

  onTabChange(updatedTab: EditorTab): void {
    this.tabs.update((currentTabs) =>
      currentTabs.map((t) => (t.id === updatedTab.id ? updatedTab : t))
    );
  }

  async reloadTab(tab: EditorTab): Promise<void> {
    this.reloadingTab.set(true);
    try {
      let freshRawJson: Record<string, unknown> | null = null;
      let freshName = tab.name;

      if (tab.sourceId && tab.associatedType) {
        if (tab.associatedType === 'schema') {
          freshRawJson = await this.plugin.get<Record<string, unknown>>(
            `/sources/v1/${tab.sourceId}/schemas/${tab.objectId}`
          );
        } else if (tab.associatedType === 'provisioning-policy') {
          freshRawJson = await this.plugin.get<Record<string, unknown>>(
            `/sources/v1/${tab.sourceId}/provisioning-policies/${tab.objectId}`
          );
        } else if (tab.associatedType === 'attribute-sync-config') {
          const syncItem = await this.apiService.fetchSourceAttributeSyncConfig(tab.sourceId);
          if (syncItem) freshRawJson = syncItem.rawJson;
        } else if (tab.associatedType === 'machine-account-subtype') {
          const subtypes = await this.apiService.fetchSourceMachineAccountSubtypes(tab.sourceId);
          const found = subtypes.find((s) => s.id === tab.objectId);
          if (found) freshRawJson = found.rawJson;
        }
      } else {
        freshRawJson = await this.apiService.fetchSingleObject(tab.objectType, tab.objectId);
      }

      if (!freshRawJson) {
        throw new Error('No data returned from tenant for this object.');
      }

      const formattedCode = JSON.stringify(freshRawJson, null, 2);
      let scriptContent = '';
      if (tab.objectType.key === 'connector-rules') {
        const sourceCode = (freshRawJson['sourceCode'] as Record<string, unknown>) || {};
        scriptContent = typeof sourceCode['script'] === 'string' ? sourceCode['script'] : '';
      }

      if (freshRawJson['name'] && typeof freshRawJson['name'] === 'string') {
        freshName = freshRawJson['name'];
      }

      const updatedTab: EditorTab = {
        ...tab,
        name: freshName,
        originalCode: formattedCode,
        editedCode: formattedCode,
        originalScript: scriptContent,
        editedScript: scriptContent,
        isDirty: false,
        jsonError: '',
        activeItem: {
          ...tab.activeItem,
          name: freshName,
          rawJson: freshRawJson,
        },
      };

      this.onTabChange(updatedTab);

      // Update in-memory typeItems cache
      const currentList = this.typeItemsMap().get(tab.objectType.key);
      if (currentList) {
        const updatedList = currentList.map((item) =>
          item.id === tab.objectId
            ? { ...item, name: freshName, rawJson: freshRawJson! }
            : item
        );
        const nextMap = new Map(this.typeItemsMap());
        nextMap.set(tab.objectType.key, updatedList);
        this.typeItemsMap.set(nextMap);
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Object Reloaded',
        detail: `Successfully pulled latest definition for "${freshName}" from tenant.`,
        life: 3000,
      });
    } catch (err) {
      console.error('Failed to reload object:', err);
      this.messageService.add({
        severity: 'error',
        summary: 'Reload Failed',
        detail: (err as Error).message || 'Failed to pull latest definition from tenant.',
        life: 6000,
      });
    } finally {
      this.reloadingTab.set(false);
    }
  }

  openInWebUi(objType: IscObjectType, item: IscObjectItem, event?: Event): void {
    if (event) event.stopPropagation();
    if (!objType.openWebUrl) return;
    const url = objType.openWebUrl(item, this.tenantUiUrl());
    if (url) {
      window.open(url, '_blank');
    }
  }

  // ==========================================================================
  // Pre-Commit Diff & Save
  // ==========================================================================

  openDiffForTab(tab: EditorTab): void {
    if (!tab.isDirty) return;

    let finalTab = tab;
    if (tab.objectType.key === 'connector-rules' && tab.editedScript !== undefined) {
      try {
        const parsed = JSON.parse(tab.editedCode);
        if (!parsed.sourceCode) parsed.sourceCode = {};
        parsed.sourceCode.script = tab.editedScript;
        const newCode = JSON.stringify(parsed, null, 2);
        finalTab = { ...tab, editedCode: newCode };
        this.onTabChange(finalTab);
      } catch {}
    }

    const diff = this.diffEngine.computeDiff(finalTab.originalCode, finalTab.editedCode);
    this.diffTab.set(finalTab);
    this.currentDiff.set(diff);
    this.diffDialogVisible.set(true);
  }

  async confirmSave(): Promise<void> {
    const tab = this.diffTab();
    if (!tab) return;

    let parsedOriginal: Record<string, unknown>;
    let parsedUpdated: Record<string, unknown>;

    try {
      parsedOriginal = JSON.parse(tab.originalCode);
      parsedUpdated = JSON.parse(tab.editedCode);
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Invalid JSON',
        detail: 'Cannot commit invalid JSON syntax.',
        life: 4000,
      });
      return;
    }

    this.saving.set(true);

    try {
      const res = await this.apiService.updateObject(
        tab.objectType,
        tab.objectId,
        parsedOriginal,
        parsedUpdated
      );

      if (res.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Successfully Deployed',
          detail: `Changes pushed live to tenant ${this.tenantOrg()} [${tab.name}]`,
          life: 4500,
        });

        const savedCode = tab.editedCode;
        const savedScript = tab.editedScript;

        const updatedTab: EditorTab = {
          ...tab,
          originalCode: savedCode,
          originalScript: savedScript,
          isDirty: false,
          activeItem: {
            ...tab.activeItem,
            rawJson: parsedUpdated,
          },
        };

        this.onTabChange(updatedTab);

        const currentList = this.typeItemsMap().get(tab.objectType.key);
        if (currentList) {
          const updatedList = currentList.map((item) =>
            item.id === tab.objectId
              ? {
                  ...item,
                  name: String(parsedUpdated['name'] || item.name),
                  rawJson: parsedUpdated,
                }
              : item
          );
          const nextMap = new Map(this.typeItemsMap());
          nextMap.set(tab.objectType.key, updatedList);
          this.typeItemsMap.set(nextMap);
        }

        this.diffDialogVisible.set(false);
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Commit Rejected by ISC',
          detail: res.error || 'Failed to update object on ISC tenant.',
          life: 8000,
        });
      }
    } catch (err) {
      this.messageService.add({
        severity: 'error',
        summary: 'Update Exception',
        detail: (err as Error).message,
        life: 8000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  cancelDiff(): void {
    this.diffDialogVisible.set(false);
  }

  // ==========================================================================
  // Generic CRUD (New, Delete, Clone)
  // ==========================================================================

  openNewResourceModal(type: IscObjectType, event?: Event): void {
    if (event) event.stopPropagation();
    this.newResourceType.set(type);
    this.newResourceName.set('');
    this.newResourceSourceId.set('');
    this.newResourceDialogVisible.set(true);

    if (type.key === 'access-profiles') {
      const cachedSources = this.typeItemsMap().get('sources');
      if (cachedSources && cachedSources.length > 0) {
        const list = cachedSources.map((s) => ({ id: s.id, name: s.name || s.id }));
        this.modalSources.set(list);
        this.newResourceSourceId.set(list[0].id);
      } else {
        this.isLoadingSourcesForModal.set(true);
        const sourcesType = this.objectTypes.find((t) => t.key === 'sources');
        if (sourcesType) {
          this.apiService
            .fetchObjects(sourcesType, 0, 100)
            .then((res) => {
              const list = (res.items || []).map((s) => ({ id: s.id, name: s.name || s.id }));
              this.modalSources.set(list);
              if (list.length > 0) {
                this.newResourceSourceId.set(list[0].id);
              }
            })
            .catch((err) => {
              console.warn('Could not load sources for access profile creation modal:', err);
            })
            .finally(() => {
              this.isLoadingSourcesForModal.set(false);
            });
        } else {
          this.isLoadingSourcesForModal.set(false);
        }
      }
    }
  }

  private async resolveCurrentIdentityId(): Promise<string> {
    const user = this.plugin.user();
    if (user?.id) {
      return user.id;
    }
    try {
      const idType = this.objectTypes.find((t) => t.key === 'public-identities');
      if (idType) {
        const res = await this.apiService.fetchObjects(idType, 0, 1);
        if (res.items && res.items.length > 0) {
          return res.items[0].id;
        }
      }
    } catch (err) {
      console.warn('Could not resolve identity fallback:', err);
    }
    return '';
  }

  async confirmCreateResource(): Promise<void> {
    const type = this.newResourceType();
    const name = this.newResourceName().trim();
    if (!type || !name) return;

    this.creatingResource.set(true);
    try {
      let payload: Record<string, unknown>;

      if (type.key === 'access-profiles') {
        let sourceId = this.newResourceSourceId();
        if (!sourceId && this.modalSources().length > 0) {
          sourceId = this.modalSources()[0].id;
        }
        if (!sourceId) {
          const sourcesType = this.objectTypes.find((t) => t.key === 'sources');
          if (sourcesType) {
            const res = await this.apiService.fetchObjects(sourcesType, 0, 1);
            if (res.items && res.items.length > 0) {
              sourceId = res.items[0].id;
            }
          }
        }
        if (!sourceId) {
          throw new Error('A Source is required to create an Access Profile, but none was found or selected.');
        }

        const ownerId = await this.resolveCurrentIdentityId();
        if (!ownerId) {
          throw new Error('An Identity Owner is required to create an Access Profile, but none could be resolved.');
        }

        payload = {
          name,
          description: 'Access profile created via Debug Console',
          enabled: false,
          requestable: false,
          owner: { type: 'IDENTITY', id: ownerId },
          source: { type: 'SOURCE', id: sourceId },
          entitlements: [],
        };
      } else if (type.key === 'roles') {
        const ownerId = await this.resolveCurrentIdentityId();
        if (!ownerId) {
          throw new Error('An Identity Owner is required to create a Role, but none could be resolved.');
        }
        payload = {
          name,
          description: 'Business role created via Debug Console',
          enabled: true,
          requestable: false,
          owner: { type: 'IDENTITY', id: ownerId },
          accessProfiles: [],
          membership: { type: 'STANDARD', criteria: null },
        };
      } else {
        const templateGen = NEW_OBJECT_TEMPLATES[type.key];
        payload = templateGen ? templateGen(name) : { name };
      }

      const res = await this.apiService.createObject(type, payload);
      if (res.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Created Successfully',
          detail: `Created new ${type.label} "${name}".`,
          life: 4000,
        });

        this.newResourceDialogVisible.set(false);
        await this.refreshType(type.key);

        const dataObj = res.data as Record<string, unknown>;
        const newId = String(dataObj?.[type.idField] || dataObj?.['id'] || name);
        this.openObjectTab(type, {
          id: newId,
          name,
          rawJson: dataObj || payload,
        });
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Creation Failed',
          detail: res.error || 'Failed to create object.',
          life: 7000,
        });
      }
    } catch (err) {
      this.messageService.add({
        severity: 'error',
        summary: 'Creation Failed',
        detail: (err as Error).message,
        life: 7000,
      });
    } finally {
      this.creatingResource.set(false);
    }
  }

  openDeleteModal(type: IscObjectType, item: IscObjectItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.deleteTargetType.set(type);
    this.deleteTargetItem.set(item);
    this.deleteConfirmInput.set('');
    this.deleteDialogVisible.set(true);
  }

  async confirmDelete(): Promise<void> {
    const type = this.deleteTargetType();
    const item = this.deleteTargetItem();
    if (!type || !item) return;

    this.isDeleting.set(true);
    try {
      const res = await this.apiService.deleteObject(type, item.id);
      if (res.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Deleted Successfully',
          detail: `Deleted ${type.label} "${item.name}".`,
          life: 4000,
        });

        this.deleteDialogVisible.set(false);

        // Remove from open tabs if present
        const tabId = `${type.key}:${item.id}`;
        this.closeTab(tabId);

        // Remove from loaded list
        const curList = this.typeItemsMap().get(type.key) || [];
        const nextList = curList.filter((i) => i.id !== item.id);
        const map = new Map(this.typeItemsMap());
        map.set(type.key, nextList);
        this.typeItemsMap.set(map);

        // Decrement count
        this.typeCountsMap.update((m) => {
          const next = new Map(m);
          const currentCount = next.get(type.key) ?? 1;
          next.set(type.key, Math.max(0, currentCount - 1));
          return next;
        });
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Delete Failed',
          detail: res.error || 'Failed to delete object.',
          life: 7000,
        });
      }
    } catch (err) {
      this.messageService.add({
        severity: 'error',
        summary: 'Delete Failed',
        detail: (err as Error).message,
        life: 7000,
      });
    } finally {
      this.isDeleting.set(false);
    }
  }

  openCloneModal(type: IscObjectType, item: IscObjectItem, event?: Event): void {
    if (event) event.stopPropagation();
    this.cloneTargetType.set(type);
    this.cloneTargetItem.set(item);
    this.cloneNewName.set(`${item.name} - Copy`);
    this.cloneDialogVisible.set(true);
  }

  async confirmClone(): Promise<void> {
    const type = this.cloneTargetType();
    const item = this.cloneTargetItem();
    const newName = this.cloneNewName().trim();
    if (!type || !item || !newName) return;

    this.isCloning.set(true);
    try {
      const res = await this.apiService.cloneObject(type, item.id, newName);
      if (res.success) {
        this.messageService.add({
          severity: 'success',
          summary: 'Cloned Successfully',
          detail: `Cloned into "${newName}".`,
          life: 4000,
        });

        this.cloneDialogVisible.set(false);
        await this.refreshType(type.key);

        const dataObj = res.data as Record<string, unknown>;
        const newId = String(dataObj?.[type.idField] || dataObj?.['id'] || newName);
        this.openObjectTab(type, {
          id: newId,
          name: newName,
          rawJson: dataObj || item.rawJson,
        });
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Clone Failed',
          detail: res.error || 'Failed to clone object.',
          life: 7000,
        });
      }
    } catch (err) {
      this.messageService.add({
        severity: 'error',
        summary: 'Clone Failed',
        detail: (err as Error).message,
        life: 7000,
      });
    } finally {
      this.isCloning.set(false);
    }
  }

  // ==========================================================================
  // Source Operations Suite (Diagnostics, Peek, Ping, Logging, CSV)
  // ==========================================================================

  async testSource(tab: EditorTab): Promise<void> {
    this.testingConnection.set(true);
    try {
      const res = await this.apiService.testSourceConnection(tab.objectId);
      this.messageService.add({
        severity: res.success ? 'success' : 'error',
        summary: res.success ? 'Test Connection Passed' : 'Test Connection Failed',
        detail: res.message,
        life: 6000,
      });
    } catch (err) {
      this.messageService.add({
        severity: 'error',
        summary: 'Test Failed',
        detail: (err as Error).message,
        life: 7000,
      });
    } finally {
      this.testingConnection.set(false);
    }
  }

  async peekSource(tab: EditorTab, objectType = 'account'): Promise<void> {
    this.peekingObjects.set(true);
    try {
      const res = await this.apiService.peekSourceObjects(tab.objectId, objectType, 10);
      this.peekResults.set(res.objects);
      this.peekDialogVisible.set(true);
      if (!res.success) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Peek Warning',
          detail: res.message || 'Could not retrieve objects.',
          life: 5000,
        });
      }
    } catch (err) {
      this.messageService.add({
        severity: 'error',
        summary: 'Peek Failed',
        detail: (err as Error).message,
        life: 7000,
      });
    } finally {
      this.peekingObjects.set(false);
    }
  }

  async pingClusterAction(tab: EditorTab): Promise<void> {
    this.messageService.add({ severity: 'info', summary: 'Pinging Cluster', detail: 'Contacting Virtual Appliances...', life: 2500 });
    try {
      const res = await this.apiService.pingCluster(tab.objectId);
      this.messageService.add({
        severity: res.success ? 'success' : 'error',
        summary: res.success ? 'Cluster Online' : 'Ping Failed',
        detail: res.message,
        life: 6000,
      });
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Ping Failed', detail: (err as Error).message, life: 7000 });
    }
  }

  openLoggingDialog(tab: EditorTab): void {
    this.loggingDialogVisible.set(true);
  }

  async confirmEnableLogging(tab: EditorTab): Promise<void> {
    const clusterId = String((tab.activeItem.rawJson as any)?.cluster?.id || tab.objectId);
    const duration = this.loggingDurationMinutes();
    try {
      const res = await this.apiService.enableConnectorLogging(clusterId, duration);
      this.messageService.add({
        severity: res.success ? 'success' : 'error',
        summary: res.success ? 'Logging Enabled' : 'Logging Failed',
        detail: res.message,
        life: 5000,
      });
      this.loggingDialogVisible.set(false);
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Logging Failed', detail: (err as Error).message, life: 7000 });
    }
  }

  async exportSourceAccountsCsv(tab: EditorTab): Promise<void> {
    try {
      this.messageService.add({ severity: 'info', summary: 'Exporting Accounts', detail: 'Fetching source accounts...', life: 2500 });
      const res = await this.plugin.get<any[]>(`/accounts/v1?filters=sourceId eq "${tab.objectId}"&limit=250`);
      const accounts = Array.isArray(res) ? res : [];
      if (accounts.length === 0) {
        this.messageService.add({ severity: 'warn', summary: 'No Accounts', detail: 'No accounts found on source to export.' });
        return;
      }
      const headers = ['id', 'nativeIdentity', 'name', 'identityId', 'disabled', 'locked', 'created', 'modified'];
      const rows = accounts.map((acc: any) =>
        headers.map((h) => JSON.stringify(acc[h] !== undefined ? acc[h] : '')).join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');
      this.downloadFile(`${tab.name}-accounts.csv`, csv, 'text/csv');
      this.messageService.add({ severity: 'success', summary: 'Export Complete', detail: `Exported ${accounts.length} accounts.` });
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Export Failed', detail: (err as Error).message, life: 7000 });
    }
  }

  triggerCsvImport(tab: EditorTab, type: 'accounts' | 'entitlements'): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const formData = new FormData();
        formData.append('file', file);
        const url = type === 'accounts'
          ? `/sources/v1/${tab.objectId}/load-accounts`
          : `/entitlements/v1/aggregate/sources/${tab.objectId}`;
        const res = await this.plugin.post<any>(url, formData);
        const taskId = res?.id || res?.taskResultId || res?.task?.id;
        if (taskId) {
          this.trackTask(taskId, `${tab.name} CSV ${type} import`, 'Import', tab.name);
        }
        this.messageService.add({
          severity: 'success',
          summary: 'Import Initiated',
          detail: 'CSV uploaded successfully. Task is being tracked.',
          life: 5000,
        });
      } catch (err) {
        this.messageService.add({ severity: 'error', summary: 'Import Failed', detail: (err as Error).message, life: 7000 });
      }
    };
    input.click();
  }

  // ==========================================================================
  // Task Status Tracking
  // ==========================================================================

  trackTask(id: string, name: string, type: string, targetName?: string): void {
    const newTask: TrackedTask = {
      id,
      name,
      type,
      status: 'IN_PROGRESS',
      started: new Date(),
      targetName,
    };
    this.trackedTasks.update((list) => [newTask, ...list.filter((t) => t.id !== id)]);
  }

  private startTaskPolling(): void {
    this.taskPollTimer = setInterval(async () => {
      const active = this.trackedTasks().filter((t) => t.status === 'IN_PROGRESS' || t.status === 'PENDING');
      if (active.length === 0) return;

      for (const task of active) {
        try {
          const statusRes = await this.apiService.getTaskStatus(task.id);
          if (statusRes?.completionStatus || statusRes?.status) {
            const rawStatus = String(statusRes.completionStatus || statusRes.status).toUpperCase();
            if (rawStatus.includes('SUCCESS') || rawStatus.includes('COMPLETED')) {
              this.updateTaskState(task.id, 'COMPLETED', statusRes.messages?.[0]?.text);
              this.messageService.add({
                severity: 'success',
                summary: 'Task Completed',
                detail: `Task "${task.name}" finished successfully.`,
                life: 5000,
              });
            } else if (rawStatus.includes('FAIL') || rawStatus.includes('ERROR')) {
              this.updateTaskState(task.id, 'FAILED', statusRes.messages?.[0]?.text || 'Task failed on tenant.');
              this.messageService.add({
                severity: 'error',
                summary: 'Task Failed',
                detail: `Task "${task.name}" reported failure.`,
                life: 7000,
              });
            }
          }
        } catch {}
      }
    }, 4500);
  }

  private updateTaskState(id: string, status: 'COMPLETED' | 'FAILED', detail?: string): void {
    this.trackedTasks.update((list) =>
      list.map((t) => (t.id === id ? { ...t, status, completed: new Date(), detail } : t))
    );
  }

  // ==========================================================================
  // Workflows Operations
  // ==========================================================================

  async toggleWorkflowEnabled(tab: EditorTab): Promise<void> {
    const nextEnabled = !tab.activeItem.enabled;
    try {
      await this.apiService.setWorkflowEnabled(tab.objectId, nextEnabled);
      this.messageService.add({
        severity: 'success',
        summary: 'Workflow Updated',
        detail: `Workflow ${nextEnabled ? 'enabled' : 'disabled'} successfully.`,
        life: 3000,
      });

      const updatedTab: EditorTab = {
        ...tab,
        activeItem: { ...tab.activeItem, enabled: nextEnabled },
      };
      this.onTabChange(updatedTab);
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Update Failed', detail: (err as Error).message });
    }
  }

  openWorkflowTestDialog(tab: EditorTab): void {
    this.workflowTestResult.set(null);
    this.workflowTestDialogVisible.set(true);
  }

  async executeWorkflowTest(tab: EditorTab): Promise<void> {
    this.testingWorkflow.set(true);
    try {
      const payload = JSON.parse(this.workflowTestInput());
      const res = await this.apiService.testWorkflow(tab.objectId, payload);
      this.workflowTestResult.set(res.result || res);
      if (res.success) {
        this.messageService.add({ severity: 'success', summary: 'Workflow Test Executed', detail: 'Workflow executed test run.' });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Test Failed', detail: res.error || 'Execution error.' });
      }
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Invalid Payload', detail: (err as Error).message });
    } finally {
      this.testingWorkflow.set(false);
    }
  }

  async openWorkflowHistoryDialog(tab: EditorTab): Promise<void> {
    this.loadingWorkflowHistory.set(true);
    this.workflowHistoryDialogVisible.set(true);
    try {
      const runs = await this.apiService.fetchWorkflowExecutions(tab.objectId);
      this.workflowExecutions.set(runs);
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'History Load Failed', detail: (err as Error).message });
    } finally {
      this.loadingWorkflowHistory.set(false);
    }
  }

  exportWorkflow(tab: EditorTab): void {
    try {
      const raw = JSON.parse(tab.editedCode);
      delete raw['id'];
      delete raw['created'];
      delete raw['creator'];
      delete raw['modified'];
      delete raw['modifiedBy'];
      delete raw['owner'];
      const jsonStr = JSON.stringify(raw, null, 2).replace(/"\$\.secrets\.[^"]+"/g, 'null');
      this.downloadFile(`${tab.name}-workflow.json`, jsonStr, 'application/json');
      this.messageService.add({
        severity: 'success',
        summary: 'Workflow Exported',
        detail: 'Sanitized workflow configuration downloaded as JSON.',
        life: 3000,
      });
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Export Failed', detail: (err as Error).message });
    }
  }

  // ==========================================================================
  // Connector Rule Validation & Script I/O
  // ==========================================================================

  async validateRule(tab: EditorTab): Promise<void> {
    this.messageService.add({ severity: 'info', summary: 'Validating Script', detail: 'Checking BeanShell syntax...', life: 2000 });
    const script = tab.editedScript || '';
    try {
      const res = await this.apiService.validateConnectorRule(script);
      if (res.valid) {
        this.messageService.add({
          severity: 'success',
          summary: 'Rule Syntax Valid',
          detail: 'Connector rule script passed syntax validation.',
          life: 4000,
        });
      } else {
        this.messageService.add({
          severity: 'error',
          summary: 'Rule Validation Errors',
          detail: res.errors?.join(' | ') || 'Validation failed.',
          life: 7000,
        });
      }
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Validation Failed', detail: (err as Error).message });
    }
  }

  exportRuleScript(tab: EditorTab): void {
    const script = tab.editedScript || '';
    this.downloadFile(`${tab.name}.bsh`, script, 'text/plain');
    this.messageService.add({ severity: 'success', summary: 'Script Exported', detail: 'Downloaded script file.' });
  }

  uploadRuleScript(tab: EditorTab): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bsh,.java,.txt';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const updatedTab: EditorTab = {
        ...tab,
        editedScript: text,
        isDirty: true,
      };
      this.onTabChange(updatedTab);
      this.messageService.add({ severity: 'success', summary: 'Script Loaded', detail: `Imported ${file.name} into editor.` });
    };
    input.click();
  }

  async refreshProfileIdentities(tab: EditorTab): Promise<void> {
    try {
      const res = await this.apiService.refreshProfileIdentities(tab.objectId);
      this.messageService.add({
        severity: 'success',
        summary: 'Refresh Queued',
        detail: res.message,
        life: 4000,
      });
    } catch (err) {
      this.messageService.add({
        severity: 'error',
        summary: 'Refresh Failed',
        detail: (err as Error).message,
        life: 6000,
      });
    }
  }

  // ==========================================================================
  // Identity Console Operations
  // ==========================================================================

  async openIdentityAccessDialog(tab: EditorTab): Promise<void> {
    this.loadingIdentityAccess.set(true);
    this.identityAccessDialogVisible.set(true);
    try {
      const access = await this.apiService.fetchIdentityAccess(tab.objectId);
      this.identityAccess.set(access);
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Access Load Failed', detail: (err as Error).message });
    } finally {
      this.loadingIdentityAccess.set(false);
    }
  }

  async revokeAccess(tab: EditorTab, item: any, type: 'ROLE' | 'ACCESS_PROFILE' | 'ENTITLEMENT'): Promise<void> {
    try {
      const res = await this.apiService.createAccessRequest(tab.objectId, item.id, type, 'REVOKE_ACCESS');
      this.messageService.add({ severity: 'success', summary: 'Revoke Requested', detail: res.message });
      await this.openIdentityAccessDialog(tab);
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Revoke Failed', detail: (err as Error).message });
    }
  }

  async openIdentityEventsDialog(tab: EditorTab): Promise<void> {
    this.loadingIdentityEvents.set(true);
    this.identityEventsDialogVisible.set(true);
    try {
      const events = await this.apiService.fetchIdentityEvents(tab.objectId);
      this.identityEvents.set(events);
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Events Load Failed', detail: (err as Error).message });
    } finally {
      this.loadingIdentityEvents.set(false);
    }
  }

  async openIdentityAccountsDialog(tab: EditorTab): Promise<void> {
    this.loadingIdentityAccounts.set(true);
    this.identityAccountsDialogVisible.set(true);
    try {
      const accounts = await this.apiService.fetchIdentityAccounts(tab.objectId);
      this.identityAccounts.set(accounts);
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Accounts Load Failed', detail: (err as Error).message });
    } finally {
      this.loadingIdentityAccounts.set(false);
    }
  }

  async accountAction(action: 'enable' | 'disable' | 'unlock' | 'reload' | 'delete', accountId: string, tab: EditorTab): Promise<void> {
    try {
      let res: { success: boolean; message: string };
      if (action === 'enable') res = await this.apiService.enableAccount(accountId);
      else if (action === 'disable') res = await this.apiService.disableAccount(accountId);
      else if (action === 'unlock') res = await this.apiService.unlockAccount(accountId);
      else if (action === 'reload') res = await this.apiService.reloadAccount(accountId);
      else res = await this.apiService.deleteAccount(accountId);

      this.messageService.add({ severity: 'success', summary: 'Account Action Executed', detail: res.message });
      await this.openIdentityAccountsDialog(tab);
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Action Failed', detail: (err as Error).message });
    }
  }

  async syncIdentityAttrs(tab: EditorTab): Promise<void> {
    try {
      const res = await this.apiService.syncIdentityAttributes(tab.objectId);
      this.messageService.add({ severity: 'success', summary: 'Sync Triggered', detail: res.message });
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Sync Failed', detail: (err as Error).message });
    }
  }

  async processIdentity(tab: EditorTab): Promise<void> {
    try {
      const res = await this.apiService.processIdentity(tab.objectId);
      this.messageService.add({ severity: 'success', summary: 'Process Queued', detail: res.message });
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Process Failed', detail: (err as Error).message });
    }
  }

  async inviteIdentity(tab: EditorTab): Promise<void> {
    try {
      const res = await this.apiService.inviteIdentity(tab.objectId);
      this.messageService.add({ severity: 'success', summary: 'Invitation Dispatched', detail: res.message });
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Invite Failed', detail: (err as Error).message });
    }
  }

  // ==========================================================================
  // Notification Templates
  // ==========================================================================

  openTestEmailDialog(tab: EditorTab): void {
    this.testEmailRecipient.set('');
    this.testEmailDialogVisible.set(true);
  }

  async sendTestEmail(tab: EditorTab): Promise<void> {
    const recipient = this.testEmailRecipient().trim();
    if (!recipient) return;

    this.sendingTestEmail.set(true);
    try {
      const res = await this.apiService.sendTestNotification(tab.objectId, recipient);
      this.messageService.add({ severity: 'success', summary: 'Test Email Sent', detail: res.message });
      this.testEmailDialogVisible.set(false);
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Send Failed', detail: (err as Error).message });
    } finally {
      this.sendingTestEmail.set(false);
    }
  }

  getNotificationBody(tab: EditorTab): string {
    try {
      const parsed = JSON.parse(tab.editedCode);
      return String(parsed['body'] || '');
    } catch {
      return '';
    }
  }

  // ==========================================================================
  // SP-Config Import / Export
  // ==========================================================================

  openSpConfigExportModal(): void {
    this.spConfigMode.set('export');
    this.spConfigResult.set(null);
    this.spConfigDialogVisible.set(true);
  }

  openSpConfigImportModal(): void {
    this.spConfigMode.set('import');
    this.spConfigResult.set(null);
    this.spConfigImportContent.set('');
    this.spConfigDialogVisible.set(true);
  }

  selectAllSpConfigTypes(): void {
    this.spConfigExportTypes.set(this.spConfigExportTypeOptions.map((opt) => opt.type));
  }

  deselectAllSpConfigTypes(): void {
    this.spConfigExportTypes.set([]);
  }

  toggleSpConfigType(typeKey: string): void {
    this.spConfigExportTypes.update((types) =>
      types.includes(typeKey) ? types.filter((t) => t !== typeKey) : [...types, typeKey]
    );
  }

  private formatSpConfigError(status: any): string {
    if (!status) return 'SP-Config export job reported failure on tenant.';
    if (typeof status.message === 'string' && status.message) return status.message;
    if (Array.isArray(status.messages) && status.messages.length > 0) {
      return status.messages
        .map((m: any) => (typeof m === 'string' ? m : m?.text || JSON.stringify(m)))
        .join('; ');
    }
    if (Array.isArray(status.errors) && status.errors.length > 0) {
      return status.errors
        .map((e: any) => (typeof e === 'string' ? e : e?.text || e?.message || JSON.stringify(e)))
        .join('; ');
    }
    if (typeof status.detail === 'string' && status.detail) return status.detail;
    return 'SP-Config export job failed on tenant.';
  }

  async executeSpConfigExport(): Promise<void> {
    const types = this.spConfigExportTypes();
    if (types.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'No Types Selected',
        detail: 'Please select at least one configuration object type to export.',
        life: 5000,
      });
      return;
    }

    this.isRunningSpConfig.set(true);
    if (this.spConfigPollTimer) {
      clearInterval(this.spConfigPollTimer);
      this.spConfigPollTimer = null;
    }

    try {
      const payload = {
        description: `Exported from ISC Debug Mode Console (${types.length} types)`,
        includeTypes: types,
      };

      const initRes = await this.apiService.exportSpConfig(payload);
      if (!initRes.success || !initRes.jobId) {
        throw new Error(initRes.error || 'Failed to start export job.');
      }

      const jobId = initRes.jobId;
      this.messageService.add({
        severity: 'info',
        summary: 'Export Queued',
        detail: `Export job ${jobId} initiated for ${types.length} type(s). Polling status...`,
        life: 5000,
      });

      let pollCount = 0;
      this.spConfigPollTimer = setInterval(async () => {
        pollCount++;
        try {
          const status = await this.apiService.getSpConfigExportStatus(jobId);
          if (status?.status === 'COMPLETE') {
            clearInterval(this.spConfigPollTimer);
            this.spConfigPollTimer = null;
            this.isRunningSpConfig.set(false);

            const pkg = await this.apiService.downloadSpConfigExport(jobId);
            const content = typeof pkg === 'string' ? pkg : JSON.stringify(pkg, null, 2);
            this.downloadFile(
              `sp-config-export-${this.tenantOrg()}-${Date.now()}.json`,
              content,
              'application/json'
            );
            this.messageService.add({
              severity: 'success',
              summary: 'Export Finished',
              detail: `Export package downloaded (${types.length} types).`,
              life: 6000,
            });
            this.spConfigDialogVisible.set(false);
          } else if (status?.status === 'FAILED') {
            clearInterval(this.spConfigPollTimer);
            this.spConfigPollTimer = null;
            this.isRunningSpConfig.set(false);

            const detailMsg = this.formatSpConfigError(status);
            this.messageService.add({
              severity: 'error',
              summary: 'Export Failed',
              detail: detailMsg,
              life: 9000,
            });
          } else if (pollCount >= 40) {
            clearInterval(this.spConfigPollTimer);
            this.spConfigPollTimer = null;
            this.isRunningSpConfig.set(false);
            this.messageService.add({
              severity: 'warn',
              summary: 'Export Timeout',
              detail: 'Export job exceeded 120 seconds. Check tenant task history or retry with fewer types.',
              life: 8000,
            });
          }
        } catch (pollErr) {
          console.warn('SP-Config status check error:', pollErr);
        }
      }, 3000);
    } catch (err) {
      this.isRunningSpConfig.set(false);
      this.messageService.add({
        severity: 'error',
        summary: 'Export Error',
        detail: (err as Error).message || 'Failed to start export job.',
        life: 7000,
      });
    }
  }

  async executeSpConfigImport(): Promise<void> {
    const content = this.spConfigImportContent().trim();
    if (!content) return;

    this.isRunningSpConfig.set(true);
    try {
      const res = await this.apiService.importSpConfig(content, this.spConfigImportPreview());
      if (res.success) {
        this.messageService.add({
          severity: 'success',
          summary: this.spConfigImportPreview() ? 'Preview Completed' : 'Import Queued',
          detail: `Job ID: ${res.jobId}`,
        });
      } else {
        this.messageService.add({ severity: 'error', summary: 'Import Failed', detail: res.error });
      }
    } catch (err) {
      this.messageService.add({ severity: 'error', summary: 'Import Error', detail: (err as Error).message });
    } finally {
      this.isRunningSpConfig.set(false);
    }
  }


  // ==========================================================================
  // Reset Dialog Helpers
  // ==========================================================================

  selectSourceAction(
    action:
      | 'accounts'
      | 'entitlements'
      | 'source'
      | 'aggregate-accounts'
      | 'aggregate-entitlements'
      | 'aggregate-accounts-no-opt',
    tab: EditorTab
  ): void {
    this.activeSourceDropdown.set(null);
    this.openResetModal(action, tab);
  }

  openResetModal(
    action:
      | 'accounts'
      | 'entitlements'
      | 'source'
      | 'aggregate-accounts'
      | 'aggregate-entitlements'
      | 'aggregate-accounts-no-opt',
    tab: EditorTab
  ): void {
    this.activeSourceDropdown.set(null);
    this.resetAction.set(action);
    this.resetTargetTab.set(tab);
    this.resetDialogVisible.set(true);
  }

  cancelReset(): void {
    if (this.resettingSource()) return;
    this.resetDialogVisible.set(false);
    this.resetTargetTab.set(null);
  }

  isResetActionDestructive(): boolean {
    const action = this.resetAction();
    return action === 'accounts' || action === 'entitlements' || action === 'source';
  }

  getResetCloudExternalId(): string | undefined {
    const tab = this.resetTargetTab();
    if (!tab) return undefined;
    return this.apiService.extractCloudExternalId(tab.activeItem.rawJson);
  }

  getResetDialogTitle(): string {
    const action = this.resetAction();
    if (action === 'accounts') return 'Reset Source Accounts';
    if (action === 'entitlements') return 'Reset Source Entitlements';
    if (action === 'source') return 'Reset Source (Full Reset)';
    if (action === 'aggregate-accounts') return 'Aggregate Accounts';
    if (action === 'aggregate-entitlements') return 'Aggregate Entitlements';
    return 'Aggregate Accounts (Without Optimization)';
  }

  getResetDialogHeader(): string {
    const action = this.resetAction();
    if (action === 'accounts') return 'Delete and reset all aggregated accounts?';
    if (action === 'entitlements') return 'Reset and purge all discovered entitlements?';
    if (action === 'source') return 'Perform full source reset (accounts & entitlements)?';
    if (action === 'aggregate-accounts') return 'Start account aggregation for this source?';
    if (action === 'aggregate-entitlements') return 'Start entitlement aggregation for this source?';
    return 'Force full unoptimized account aggregation?';
  }

  getResetDialogDescription(): string {
    const action = this.resetAction();
    if (action === 'accounts') {
      return 'This calls the ISC reset API to permanently clear all account records for this source. Existing accounts will be deleted until the next aggregation.';
    }
    if (action === 'entitlements') {
      return 'This calls the ISC reset API to clear all entitlements discovered for this source and invalidate dependent access profiles.';
    }
    if (action === 'source') {
      return 'This permanently purges BOTH accounts and entitlements for this source on Identity Security Cloud. This cannot be undone.';
    }
    if (action === 'aggregate-accounts') {
      return 'This queues an optimized account aggregation task on Identity Security Cloud. Only accounts modified since the last aggregation will be processed.';
    }
    if (action === 'aggregate-entitlements') {
      return 'This queues an entitlement discovery and catalog aggregation task on Identity Security Cloud for this source.';
    }
    return 'This forces ISC to re-evaluate and re-correlate ALL accounts on this source without delta optimization. Correlation logic, manager correlation, and identity mappings will be fully refreshed. Note: This may take significantly longer than an optimized aggregation.';
  }

  getResetConfirmButtonLabel(): string {
    const action = this.resetAction();
    if (action === 'accounts') return 'Confirm Reset Accounts';
    if (action === 'entitlements') return 'Confirm Reset Entitlements';
    if (action === 'source') return 'Confirm Full Reset';
    if (action === 'aggregate-accounts') return 'Start Aggregation';
    if (action === 'aggregate-entitlements') return 'Start Entitlement Aggregation';
    return 'Start Unoptimized Aggregation';
  }

  async executeReset(): Promise<void> {
    const tab = this.resetTargetTab();
    if (!tab) return;

    const action = this.resetAction();
    const sourceId = tab.objectId;
    const cloudExtId = this.getResetCloudExternalId();

    this.resettingSource.set(true);
    try {
      let res: { success: boolean; message: string; taskId?: string };
      if (action === 'accounts') {
        res = await this.apiService.resetSourceAccounts(sourceId, cloudExtId);
      } else if (action === 'entitlements') {
        res = await this.apiService.resetSourceEntitlements(sourceId, cloudExtId);
      } else if (action === 'source') {
        res = await this.apiService.resetSource(sourceId, cloudExtId);
      } else if (action === 'aggregate-accounts') {
        res = await this.apiService.aggregateSourceAccounts(sourceId, cloudExtId, false);
      } else if (action === 'aggregate-accounts-no-opt') {
        res = await this.apiService.aggregateSourceAccounts(sourceId, cloudExtId, true);
      } else {
        res = await this.apiService.aggregateSourceEntitlements(sourceId, cloudExtId);
      }

      if (res.taskId) {
        this.trackTask(res.taskId, `${tab.name} (${action})`, 'Aggregation', tab.name);
      }

      const isAgg = action.startsWith('aggregate');
      this.messageService.add({
        severity: 'success',
        summary: isAgg ? 'Aggregation Queued' : 'Source Reset Succeeded',
        detail: res.message,
        life: 6000,
      });

      this.resetDialogVisible.set(false);
      this.resetTargetTab.set(null);
    } catch (err: unknown) {
      const isAgg = action.startsWith('aggregate');
      this.messageService.add({
        severity: 'error',
        summary: isAgg ? 'Aggregation Failed' : 'Source Reset Failed',
        detail: (err as Error).message || `Failed to execute ${action} on ISC tenant.`,
        life: 8000,
      });
    } finally {
      this.resettingSource.set(false);
    }
  }

  // ==========================================================================
  // Layout & UI Helpers
  // ==========================================================================

  setActiveView(view: 'explorer' | 'logs'): void {
    this.activeView.set(view);
  }

  onExplorerIconClick(): void {
    if (this.activeView() !== 'explorer') {
      this.activeView.set('explorer');
      this.sidebarOpen.set(true);
    } else {
      this.toggleSidebar();
    }
  }

  toggleSidebar(): void {
    this.sidebarOpen.set(!this.sidebarOpen());
  }

  startSidebarResize(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isResizingSidebar.set(true);

    const startX = event.clientX;
    const startWidth = this.sidebarWidth();

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaX = moveEvent.clientX - startX;
      const maxAllowed = Math.max(500, window.innerWidth - 300);
      const newWidth = Math.max(220, Math.min(startWidth + deltaX, maxAllowed));
      this.sidebarWidth.set(newWidth);
    };

    const onMouseUp = () => {
      this.isResizingSidebar.set(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      try {
        localStorage.setItem('identityexe_sidebar_width', String(this.sidebarWidth()));
      } catch {}
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  resetSidebarWidth(): void {
    this.sidebarWidth.set(320);
    try {
      localStorage.removeItem('identityexe_sidebar_width');
    } catch {}
  }

  toggleSourceDropdown(type: 'aggregate' | 'reset' | 'diagnostics' | 'data', event: MouseEvent): void {
    event.stopPropagation();
    this.activeSourceDropdown.update((curr) => (curr === type ? null : type));
  }

  closeSourceDropdown(): void {
    this.activeSourceDropdown.set(null);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (this.activeSourceDropdown() && !target?.closest('.source-dropdown-wrapper')) {
      this.activeSourceDropdown.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  onEscapePress(): void {
    if (this.activeSourceDropdown()) {
      this.activeSourceDropdown.set(null);
    }
  }

  private downloadFile(filename: string, content: string, contentType: string): void {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==========================================================================
  // Source Associated Objects (Schemas, Policies, etc.)
  // ==========================================================================

  isSourceExpanded(sourceId: string): boolean {
    return this.expandedSourceIds().has(sourceId);
  }

  isSourceAssocLoading(sourceId: string): boolean {
    return this.loadingSourceAssocMap().get(sourceId) === true;
  }

  getSourceSchemas(sourceId: string): IscObjectItem[] {
    return this.sourceAssociatedMap().get(sourceId)?.schemas || [];
  }

  getSourcePolicies(sourceId: string): IscObjectItem[] {
    return this.sourceAssociatedMap().get(sourceId)?.provisioningPolicies || [];
  }

  getSourceSyncConfig(sourceId: string): IscObjectItem | null {
    return this.sourceAssociatedMap().get(sourceId)?.attributeSyncConfig || null;
  }

  getSyncAttrSummary(sourceId: string): string {
    const cfg = this.getSourceSyncConfig(sourceId);
    if (!cfg) return 'Not Configured';
    const raw = cfg.rawJson as any;
    const attrs = Array.isArray(raw?.attributes) ? raw.attributes : [];
    const enabled = attrs.filter((a: any) => a.enabled).length;
    return `${enabled}/${attrs.length} synced`;
  }

  getSourceSubtypes(sourceId: string): IscObjectItem[] {
    return this.sourceAssociatedMap().get(sourceId)?.machineAccountSubtypes || [];
  }

  getSourceRules(sourceId: string): IscObjectItem[] {
    return this.sourceAssociatedMap().get(sourceId)?.rules || [];
  }

  isSubgroupOpen(sourceId: string, group: string): boolean {
    const set = this.openSubgroupsMap().get(sourceId);
    return set ? set.has(group) : false;
  }

  toggleSourceSubgroup(sourceId: string, group: string, event?: MouseEvent): void {
    if (event) event.stopPropagation();
    const map = new Map(this.openSubgroupsMap());
    const current = new Set(map.get(sourceId) || []);
    if (current.has(group)) {
      current.delete(group);
    } else {
      current.add(group);
    }
    map.set(sourceId, current);
    this.openSubgroupsMap.set(map);
  }

  async toggleSourceExpanded(sourceItem: IscObjectItem, event?: MouseEvent): Promise<void> {
    if (event) event.stopPropagation();
    const nextSet = new Set(this.expandedSourceIds());
    if (nextSet.has(sourceItem.id)) {
      nextSet.delete(sourceItem.id);
      this.expandedSourceIds.set(nextSet);
    } else {
      nextSet.add(sourceItem.id);
      this.expandedSourceIds.set(nextSet);
      if (!this.sourceAssociatedMap().has(sourceItem.id)) {
        await this.pullSourceAssociated(sourceItem);
      }
    }
  }

  async pullSourceAssociated(sourceItem: IscObjectItem, event?: MouseEvent): Promise<void> {
    if (event) event.stopPropagation();
    const loadingNext = new Map(this.loadingSourceAssocMap());
    loadingNext.set(sourceItem.id, true);
    this.loadingSourceAssocMap.set(loadingNext);

    try {
      const bundle = await this.apiService.fetchSourceAssociatedBundle(
        sourceItem.id,
        sourceItem.name,
        sourceItem.rawJson
      );
      const assocNext = new Map(this.sourceAssociatedMap());
      assocNext.set(sourceItem.id, bundle);
      this.sourceAssociatedMap.set(assocNext);

      const groupMap = new Map(this.openSubgroupsMap());
      if (!groupMap.has(sourceItem.id)) {
        groupMap.set(sourceItem.id, new Set<string>());
      }
      this.openSubgroupsMap.set(groupMap);

      const exp = new Set(this.expandedSourceIds());
      exp.add(sourceItem.id);
      this.expandedSourceIds.set(exp);
    } catch (err) {
      this.messageService.add({
        severity: 'error',
        summary: 'Failed to Pull Associated Objects',
        detail: (err as Error).message,
        life: 6000,
      });
    } finally {
      const loadingDone = new Map(this.loadingSourceAssocMap());
      loadingDone.set(sourceItem.id, false);
      this.loadingSourceAssocMap.set(loadingDone);
    }
  }

  openSourceSchemaTab(sourceItem: IscObjectItem, schema: IscObjectItem): void {
    const tabId = `schema:${sourceItem.id}:${schema.id}`;
    const existing = this.tabs().find((t) => t.id === tabId);
    if (existing) {
      this.activeTabId.set(tabId);
      return;
    }

    const schemaType: IscObjectType = {
      key: 'sources',
      label: `${sourceItem.name} / ${schema.name} [Schema]`,
      category: 'Sources & Accounts',
      endpoint: `/sources/v1/${sourceItem.id}/schemas`,
      description: `Schema definition for source ${sourceItem.name}`,
      icon: 'pi pi-table',
      supportsUpdate: true,
      updateMethod: 'PUT',
      idField: 'id',
      nameField: 'name',
    };

    const formattedCode = JSON.stringify(schema.rawJson, null, 2);
    const newTab: EditorTab = {
      id: tabId,
      objectId: schema.id,
      name: `${sourceItem.name} / ${schema.name} [Schema]`,
      objectType: schemaType,
      activeItem: schema,
      originalCode: formattedCode,
      editedCode: formattedCode,
      isDirty: false,
      activeSubTab: 'editor',
      jsonError: '',
      sourceId: sourceItem.id,
      sourceName: sourceItem.name,
      associatedType: 'schema',
    };

    this.tabs.update((list) => [...list, newTab]);
    this.activeTabId.set(tabId);
  }

  openSourcePolicyTab(sourceItem: IscObjectItem, policy: IscObjectItem): void {
    const tabId = `policy:${sourceItem.id}:${policy.id}`;
    const existing = this.tabs().find((t) => t.id === tabId);
    if (existing) {
      this.activeTabId.set(tabId);
      return;
    }

    const policyType: IscObjectType = {
      key: 'sources',
      label: `${sourceItem.name} / ${policy.id} [Policy]`,
      category: 'Sources & Accounts',
      endpoint: `/sources/v1/${sourceItem.id}/provisioning-policies`,
      description: `Provisioning policy (${policy.id}) for source ${sourceItem.name}`,
      icon: 'pi pi-file-edit',
      supportsUpdate: true,
      updateMethod: 'PUT',
      idField: 'usageType',
      nameField: 'usageType',
    };

    const formattedCode = JSON.stringify(policy.rawJson, null, 2);
    const newTab: EditorTab = {
      id: tabId,
      objectId: policy.id,
      name: `${sourceItem.name} / ${policy.id} [Policy]`,
      objectType: policyType,
      activeItem: policy,
      originalCode: formattedCode,
      editedCode: formattedCode,
      isDirty: false,
      activeSubTab: 'editor',
      jsonError: '',
      sourceId: sourceItem.id,
      sourceName: sourceItem.name,
      associatedType: 'provisioning-policy',
    };

    this.tabs.update((list) => [...list, newTab]);
    this.activeTabId.set(tabId);
  }

  async openSourceSyncConfigTab(sourceItem: IscObjectItem): Promise<void> {
    const tabId = `sync-config:${sourceItem.id}:attribute-sync-config`;
    const existing = this.tabs().find((t) => t.id === tabId);
    if (existing) {
      this.activeTabId.set(tabId);
      return;
    }

    let cfg = this.getSourceSyncConfig(sourceItem.id);
    if (!cfg) {
      cfg = await this.apiService.fetchSourceAttributeSyncConfig(sourceItem.id);
    }

    if (!cfg) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Attribute Sync Not Configured',
        detail: `Source "${sourceItem.name}" has no attribute synchronization configured.`,
        life: 5000,
      });
      return;
    }

    const syncType: IscObjectType = {
      key: 'sources',
      label: `${sourceItem.name} / Attribute Sync Config`,
      category: 'Sources & Accounts',
      endpoint: `/sources/v1/${sourceItem.id}`,
      description: `Attribute sync configuration for source ${sourceItem.name}`,
      icon: 'pi pi-sync',
      supportsUpdate: true,
      updateMethod: 'PUT',
      idField: 'id',
      nameField: 'name',
    };

    const formattedCode = JSON.stringify(cfg.rawJson, null, 2);
    const newTab: EditorTab = {
      id: tabId,
      objectId: 'attribute-sync-config',
      name: `${sourceItem.name} / Attribute Sync Config`,
      objectType: syncType,
      activeItem: cfg,
      originalCode: formattedCode,
      editedCode: formattedCode,
      isDirty: false,
      activeSubTab: 'editor',
      jsonError: '',
      sourceId: sourceItem.id,
      sourceName: sourceItem.name,
      associatedType: 'attribute-sync-config',
    };

    this.tabs.update((list) => [...list, newTab]);
    this.activeTabId.set(tabId);
  }

  openSourceSubtypeTab(sourceItem: IscObjectItem, subtype: IscObjectItem): void {
    const tabId = `subtype:${sourceItem.id}:${subtype.id}`;
    const existing = this.tabs().find((t) => t.id === tabId);
    if (existing) {
      this.activeTabId.set(tabId);
      return;
    }

    const subtypeType: IscObjectType = {
      key: 'sources',
      label: `${sourceItem.name} / ${subtype.name} [Subtype]`,
      category: 'Sources & Accounts',
      endpoint: `/source-subtypes/v1`,
      description: `Machine account subtype for source ${sourceItem.name}`,
      icon: 'pi pi-server',
      supportsUpdate: true,
      updateMethod: 'PUT',
      idField: 'id',
      nameField: 'name',
    };

    const formattedCode = JSON.stringify(subtype.rawJson, null, 2);
    const newTab: EditorTab = {
      id: tabId,
      objectId: subtype.id,
      name: `${sourceItem.name} / ${subtype.name} [Subtype]`,
      objectType: subtypeType,
      activeItem: subtype,
      originalCode: formattedCode,
      editedCode: formattedCode,
      isDirty: false,
      activeSubTab: 'editor',
      jsonError: '',
      sourceId: sourceItem.id,
      sourceName: sourceItem.name,
      associatedType: 'machine-account-subtype',
    };

    this.tabs.update((list) => [...list, newTab]);
    this.activeTabId.set(tabId);
  }

  async openSourceRuleTab(ruleItem: IscObjectItem): Promise<void> {
    const ruleObjType = this.objectTypes.find((t) => t.key === 'connector-rules')!;
    try {
      const fullRule = await this.apiService.fetchSingleObject(ruleObjType, ruleItem.id);
      this.openObjectTab(ruleObjType, {
        id: ruleItem.id,
        name: String(fullRule['name'] || ruleItem.name),
        rawJson: fullRule,
      });
    } catch {
      this.openObjectTab(ruleObjType, ruleItem);
    }
  }
}
