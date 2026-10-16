import { Injectable, inject } from '@angular/core';
import { SailpointPluginService, PluginApiError } from '@core';
import {
  IscObjectItem,
  IscObjectType,
  SourceAssociatedObjects,
  PreviewIdentityOption,
  IdentityPreviewResult,
} from './debug-mode.models';
import { DiffEngineService } from './diff-engine.service';

@Injectable({ providedIn: 'root' })
export class DebugModeApiService {
  private readonly plugin = inject(SailpointPluginService);
  private readonly diffEngine = inject(DiffEngineService);

  // ==========================================================================
  // Object Fetching, Pagination & Server-Side Search
  // ==========================================================================

  async fetchObjects(
    objectType: IscObjectType,
    offset = 0,
    limit = 100,
    searchQuery = ''
  ): Promise<{ items: IscObjectItem[]; totalCount?: number }> {
    try {
      const q = searchQuery.trim();

      // 1. Applications (try source-apps/v1 first, fallback to search/v1)
      if (objectType.key === 'applications') {
        try {
          let url = `/source-apps/v1?limit=${limit}&offset=${offset}&count=true`;
          if (q) {
            url += `&filters=name co "${encodeURIComponent(q)}"`;
          }
          const res = await this.plugin.getWithResponse<unknown[]>(url, { experimental: true });
          const rawItems = Array.isArray(res.data) ? res.data : [];
          const items = rawItems.map((app: any) => this.mapRawToObjectItem(objectType, app));
          return { items, totalCount: res.totalCount };
        } catch {
          // Fallback to /search/v1
          const searchPayload = {
            indices: ['apps'],
            query: { query: q ? `*${q}*` : '*' },
            sort: ['name'],
          };
          const res = await this.plugin.postWithResponse<any[]>('/search/v1', searchPayload);
          const raw = Array.isArray(res.data) ? res.data : [];
          const page = raw.slice(offset, offset + limit);
          const items = page.map((app: any) => ({
            id: String(app.id || ''),
            name: String(app.name || app.description || 'Application'),
            type: app.source?.name ? `Source: ${app.source.name}` : (app.type || 'App'),
            description: app.description || (app.accessProfileCount ? `${app.accessProfileCount} Access Profile(s)` : undefined),
            modified: app.modified,
            created: app.created,
            enabled: typeof app.enabled === 'boolean' ? app.enabled : undefined,
            rawJson: app,
          }));
          return { items, totalCount: res.totalCount ?? raw.length };
        }
      }

      // 2. Public Identities with Server Search
      if (objectType.key === 'public-identities' && q) {
        const searchPayload = {
          indices: ['identities'],
          query: { query: q },
          sort: ['name'],
        };
        const res = await this.plugin.postWithResponse<any[]>('/search/v1', searchPayload);
        const raw = Array.isArray(res.data) ? res.data : [];
        const page = raw.slice(offset, offset + limit);
        const items = page.map((item: any) => this.mapRawToObjectItem(objectType, item));
        return { items, totalCount: res.totalCount ?? raw.length };
      }

      // 3. Cloud Rules
      if (objectType.key === 'cloud-rules') {
        try {
          const raw = await this.plugin.get<any[]>('/v3/cloud-rules');
          const list = Array.isArray(raw) ? raw : [];
          const filtered = q
            ? list.filter((r: any) => (r.name || '').toLowerCase().includes(q.toLowerCase()))
            : list;
          const page = filtered.slice(offset, offset + limit);
          return {
            items: page.map((r: any) => this.mapRawToObjectItem(objectType, r)),
            totalCount: filtered.length,
          };
        } catch {
          return { items: [], totalCount: 0 };
        }
      }

      // 4. Notification Templates (merges system defaults with tenant custom overrides)
      if (objectType.key === 'notification-templates') {
        try {
          const [defaultsRes, customRes] = await Promise.allSettled([
            this.plugin.get<any[]>('/notification-template-defaults/v1'),
            this.plugin.get<any[]>('/notification-templates/v1'),
          ]);

          const defaultsList: any[] = defaultsRes.status === 'fulfilled' && Array.isArray(defaultsRes.value) ? defaultsRes.value : [];
          const customList: any[] = customRes.status === 'fulfilled' && Array.isArray(customRes.value) ? customRes.value : [];

          const templateMap = new Map<string, any>();
          for (const def of defaultsList) {
            const k = def.key || def.id;
            if (k) templateMap.set(k, { ...def, _isCustom: false });
          }
          for (const cust of customList) {
            const k = cust.key || cust.id;
            if (k) templateMap.set(k, { ...cust, _isCustom: true });
          }

          let allTemplates = Array.from(templateMap.values());
          if (q) {
            const lowerQ = q.toLowerCase();
            allTemplates = allTemplates.filter(
              (t) =>
                (t.name && t.name.toLowerCase().includes(lowerQ)) ||
                (t.key && t.key.toLowerCase().includes(lowerQ)) ||
                (t.subject && t.subject.toLowerCase().includes(lowerQ)) ||
                (t.description && t.description.toLowerCase().includes(lowerQ))
            );
          }

          const totalCount = allTemplates.length;
          const pageItems = allTemplates.slice(offset, offset + limit);
          const mapped = pageItems.map((item: any) => this.mapRawToObjectItem(objectType, item));
          return { items: mapped, totalCount };
        } catch (err) {
          console.error('Failed to load notification templates:', err);
          throw err;
        }
      }

      // 5. Standard endpoints with query parameters
      let queryPath = objectType.endpoint;
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      params.set('count', 'true');

      if (['roles', 'access-profiles', 'entitlements'].includes(objectType.key)) {
        params.set('sorters', 'name');
      }

      if (q) {
        if (['roles', 'access-profiles', 'entitlements', 'sources', 'identity-profiles', 'segments', 'sod-policies'].includes(objectType.key)) {
          params.set('filters', `name co "${q}"`);
        }
      }

      queryPath = `${objectType.endpoint}?${params.toString()}`;

      const res = await this.plugin.getWithResponse<unknown>(queryPath);
      let items: any[] = [];
      const raw = res.data;

      if (Array.isArray(raw)) {
        items = raw;
      } else if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        if (Array.isArray(obj['items'])) {
          items = obj['items'];
        } else if (Array.isArray(obj['results'])) {
          items = obj['results'];
        }
      }

      const mapped = items.map((item: any) => this.mapRawToObjectItem(objectType, item));
      return { items: mapped, totalCount: res.totalCount };
    } catch (err) {
      console.error(`Failed to load ${objectType.label}:`, err);
      throw err;
    }
  }

  private mapRawToObjectItem(objectType: IscObjectType, item: any): IscObjectItem {
    const id = String(item[objectType.idField] || item.id || '');
    const name = String(item[objectType.nameField] || item.name || item.value || item.displayName || id || 'Untitled');
    let type = objectType.typeField ? item[objectType.typeField] : (item.type || undefined);
    let description = item.description || item.summary || undefined;

    if (objectType.key === 'entitlements') {
      if (item.source?.name) {
        type = `${item.attribute || 'Entitlement'} (${item.source.name})`;
      }
      if (item.value && !description) {
        description = `Value: ${item.value}`;
      }
    } else if (objectType.key === 'accounts') {
      if (item.sourceId) {
        type = `Source ID: ${item.sourceId}`;
      }
    } else if (objectType.key === 'forms') {
      const elCount = Array.isArray(item.formElements) ? item.formElements.length : 0;
      type = `${elCount} element${elCount === 1 ? '' : 's'}`;
      if (item.owner?.fullName) {
        description = `Owner: ${item.owner.fullName}${item.description ? ' - ' + item.description : ''}`;
      }
    } else if (objectType.key === 'notification-templates') {
      type = item.medium || 'EMAIL';
      if (item._isCustom) {
        type = `${type} [Custom]`;
      }
      description = item.subject || item.description || (item.replyTo ? `Reply-To: ${item.replyTo}` : undefined);
    } else if (objectType.key === 'identity-attributes') {
      type = item.type || 'string';
      description = item.searchable ? 'Searchable' : undefined;
    }

    const modified = item.modified || item.lastModified || item.updated || undefined;
    const created = item.created || item.createdDate || undefined;
    const enabled = typeof item.enabled === 'boolean' ? item.enabled : undefined;
    const internal = typeof item.internal === 'boolean' ? item.internal : undefined;

    return {
      id,
      name,
      type: type ? String(type) : undefined,
      description: description ? String(description) : undefined,
      modified: modified ? String(modified) : undefined,
      created: created ? String(created) : undefined,
      enabled,
      internal,
      rawJson: item,
    };
  }

  async fetchObjectCount(objectType: IscObjectType): Promise<number> {
    try {
      if (objectType.key === 'applications') {
        const countRes = await this.plugin.postWithResponse<unknown>('/search/v1/count', {
          indices: ['apps'],
          query: { query: '*' },
        });
        if (countRes.totalCount !== undefined && !isNaN(countRes.totalCount)) {
          return countRes.totalCount;
        }
      }

      if (objectType.key === 'notification-templates') {
        try {
          const defaults = await this.plugin.get<any[]>('/notification-template-defaults/v1');
          if (Array.isArray(defaults)) return defaults.length;
        } catch {}
      }

      let queryPath = objectType.endpoint;
      if (
        ['roles', 'access-profiles', 'entitlements', 'sources', 'identity-profiles', 'segments', 'sod-policies', 'public-identities', 'accounts', 'machine-identities'].includes(
          objectType.key
        )
      ) {
        queryPath = `${objectType.endpoint}?limit=1&count=true`;
      } else if (objectType.key === 'forms') {
        queryPath = `${objectType.endpoint}?limit=1`;
      }

      const res = await this.plugin.getWithResponse<unknown>(queryPath);

      if (res.totalCount !== undefined && !isNaN(res.totalCount)) {
        return res.totalCount;
      }

      const raw = res.data;
      if (Array.isArray(raw)) {
        return raw.length;
      }
      if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        if (typeof obj['total'] === 'number') return obj['total'];
        if (typeof obj['count'] === 'number') return obj['count'];
        if (Array.isArray(obj['items'])) return obj['items'].length;
        if (Array.isArray(obj['results'])) return obj['results'].length;
      }

      return 0;
    } catch (err) {
      console.warn(`Failed to fetch count for ${objectType.label}:`, err);
      return 0;
    }
  }

  async fetchSingleObject(objectType: IscObjectType, id: string): Promise<Record<string, unknown>> {
    if (objectType.key === 'applications') {
      try {
        return await this.plugin.get<Record<string, unknown>>(`/source-apps/v1/${encodeURIComponent(id)}`);
      } catch {
        const res = await this.plugin.post<any[]>('/search/v1', {
          indices: ['apps'],
          query: { query: `id:"${id}"` },
        });
        if (Array.isArray(res) && res.length > 0) {
          return res[0];
        }
      }
    }

    if (objectType.key === 'notification-templates') {
      try {
        return await this.plugin.get<Record<string, unknown>>(`/notification-templates/v1/${encodeURIComponent(id)}`);
      } catch {
        const defaults = await this.plugin.get<any[]>('/notification-template-defaults/v1');
        const found = defaults?.find((d: any) => d.key === id || d.name === id);
        if (found) return found;
        throw new Error(`Notification template "${id}" not found.`);
      }
    }

    const path = `${objectType.endpoint}/${encodeURIComponent(id)}`;
    return this.plugin.get<Record<string, unknown>>(path);
  }

  // ==========================================================================
  // Generic CRUD (Create, Update, Delete, Clone)
  // ==========================================================================

  async createObject(
    objectType: IscObjectType,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const res = await this.plugin.post<unknown>(objectType.endpoint, payload);
      return { success: true, data: res };
    } catch (err: unknown) {
      return { success: false, error: this.formatApiError(err) || 'Failed to create object on ISC tenant.' };
    }
  }

  async deleteObject(objectType: IscObjectType, id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const path = `${objectType.endpoint}/${encodeURIComponent(id)}`;
      await this.plugin.delete<unknown>(path);
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: this.formatApiError(err) || `Failed to delete ${objectType.label} [${id}].` };
    }
  }

  async cloneObject(
    objectType: IscObjectType,
    sourceId: string,
    newName: string
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const original = await this.fetchSingleObject(objectType, sourceId);
      const cloned = JSON.parse(JSON.stringify(original));

      // Remove tenant-specific immutable identifiers
      delete cloned['id'];
      delete cloned['created'];
      delete cloned['modified'];
      delete cloned['creator'];
      delete cloned['modifiedBy'];
      delete cloned['cloudExternalId'];

      cloned['name'] = newName;
      if (cloned['displayName']) {
        cloned['displayName'] = newName;
      }

      return await this.createObject(objectType, cloned);
    } catch (err: unknown) {
      return { success: false, error: this.formatApiError(err) || 'Failed to clone object.' };
    }
  }

  async updateObject(
    objectType: IscObjectType,
    id: string,
    originalObj: Record<string, unknown>,
    updatedObj: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    if (!objectType.supportsUpdate) {
      return { success: false, error: `${objectType.label} is read-only and does not support direct updates.` };
    }

    if (objectType.key === 'notification-templates') {
      try {
        const result = await this.plugin.post<unknown>('/notification-templates/v1', updatedObj);
        return { success: true, data: result };
      } catch (err: unknown) {
        console.error(`Error updating notification template [${id}]:`, err);
        return { success: false, error: this.formatApiError(err) || 'Failed to update notification template.' };
      }
    }

    const path = `${objectType.endpoint}/${encodeURIComponent(id)}`;

    try {
      if (objectType.updateMethod === 'PUT') {
        const result = await this.plugin.put<unknown>(path, updatedObj);
        return { success: true, data: result };
      }

      // PATCH with RFC 6902 JSON Patch operations
      const patchOps = this.diffEngine.generateJsonPatch(originalObj, updatedObj);
      if (patchOps.length === 0) {
        return { success: true, data: originalObj };
      }

      const result = await this.plugin.patch<unknown>(path, patchOps);
      return { success: true, data: result };
    } catch (err: unknown) {
      console.error(`Error updating ${objectType.label} [${id}]:`, err);
      return { success: false, error: this.formatApiError(err) || 'Unknown error occurred while pushing changes to ISC.' };
    }
  }

  // ==========================================================================
  // Source Associated Objects & CRUD
  // ==========================================================================

  async fetchSourceSchemas(sourceId: string): Promise<IscObjectItem[]> {
    try {
      const raw = await this.plugin.get<unknown[]>(`/sources/v1/${sourceId}/schemas`);
      const items = Array.isArray(raw) ? raw : [];
      return items.map((s: any) => ({
        id: String(s.id || s.name || ''),
        name: String(s.name || s.nativeObjectType || 'Schema'),
        type: String(s.nativeObjectType || 'Object Schema'),
        description: s.identityAttribute ? `Identity: ${s.identityAttribute} | Display: ${s.displayAttribute || 'none'}` : undefined,
        modified: s.modified,
        created: s.created,
        rawJson: s,
      }));
    } catch (err) {
      console.warn(`Could not load schemas for source ${sourceId}:`, err);
      return [];
    }
  }

  async createSourceSchema(sourceId: string, schema: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const res = await this.plugin.post<unknown>(`/sources/v1/${sourceId}/schemas`, schema);
      return { success: true, data: res };
    } catch (err) {
      return { success: false, error: this.formatApiError(err) || 'Failed to create schema.' };
    }
  }

  async deleteSourceSchema(sourceId: string, schemaId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.plugin.delete<unknown>(`/sources/v1/${sourceId}/schemas/${schemaId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: this.formatApiError(err) || 'Failed to delete schema.' };
    }
  }

  async fetchSourceProvisioningPolicies(sourceId: string): Promise<IscObjectItem[]> {
    try {
      const raw = await this.plugin.get<unknown[]>(`/sources/v1/${sourceId}/provisioning-policies`);
      const items = Array.isArray(raw) ? raw : [];
      return items.map((p: any) => ({
        id: String(p.usageType || p.name || 'CREATE'),
        name: `${p.usageType || 'POLICY'} (${p.name || 'Provisioning Policy'})`,
        type: String(p.usageType || 'Policy'),
        description: `${(p.fields || []).length} mapped fields / transforms`,
        rawJson: p,
      }));
    } catch (err) {
      console.warn(`Could not load provisioning policies for source ${sourceId}:`, err);
      return [];
    }
  }

  async createSourcePolicy(sourceId: string, policy: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const res = await this.plugin.post<unknown>(`/sources/v1/${sourceId}/provisioning-policies`, policy);
      return { success: true, data: res };
    } catch (err) {
      return { success: false, error: this.formatApiError(err) || 'Failed to create provisioning policy.' };
    }
  }

  async deleteSourcePolicy(sourceId: string, policyUsageType: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.plugin.delete<unknown>(`/sources/v1/${sourceId}/provisioning-policies/${encodeURIComponent(policyUsageType)}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: this.formatApiError(err) || 'Failed to delete provisioning policy.' };
    }
  }

  async fetchSourceAttributeSyncConfig(sourceId: string): Promise<IscObjectItem | null> {
    try {
      const raw = await this.plugin.get<any>(`/sources/v1/${sourceId}/attribute-sync-config`);
      if (!raw || typeof raw !== 'object') return null;
      const attrCount = Array.isArray(raw.attributes) ? raw.attributes.length : 0;
      const enabledCount = Array.isArray(raw.attributes) ? raw.attributes.filter((a: any) => a.enabled).length : 0;
      return {
        id: 'attribute-sync-config',
        name: 'Attribute Sync Configuration',
        type: 'Sync Config',
        description: `${enabledCount} of ${attrCount} attributes actively synchronized`,
        rawJson: raw,
      };
    } catch (err) {
      console.warn(`Could not load attribute sync config for source ${sourceId}:`, err);
      return null;
    }
  }

  async fetchSourceMachineAccountSubtypes(sourceId: string): Promise<IscObjectItem[]> {
    try {
      const raw = await this.plugin.get<unknown[]>('/source-subtypes/v1');
      const items = Array.isArray(raw) ? raw : [];
      return items
        .filter((item: any) => item.source_id === sourceId)
        .map((sub: any) => ({
          id: String(sub.id || sub.technical_name || ''),
          name: String(sub.display_name || sub.technical_name || 'Subtype'),
          type: String(sub.type || 'MACHINE'),
          description: sub.description || `Technical name: ${sub.technical_name}`,
          rawJson: sub,
        }));
    } catch (err) {
      console.warn(`Could not load machine account subtypes for source ${sourceId}:`, err);
      return [];
    }
  }

  extractSourceRules(sourceRawJson?: Record<string, unknown>): IscObjectItem[] {
    if (!sourceRawJson) return [];
    const rules: IscObjectItem[] = [];
    const ruleKeys = [
      { key: 'beforeProvisioningRule', label: 'Before Provisioning Rule' },
      { key: 'afterAggregationRule', label: 'After Aggregation Rule' },
      { key: 'beforeAggregationRule', label: 'Before Aggregation Rule' },
      { key: 'beforeModifyRule', label: 'Before Modify Rule' },
      { key: 'afterModifyRule', label: 'After Modify Rule' },
      { key: 'jdbcBuildMapRule', label: 'JDBC BuildMap Rule' },
    ];

    for (const rk of ruleKeys) {
      const val = sourceRawJson[rk.key];
      if (val && typeof val === 'object') {
        const robj = val as Record<string, unknown>;
        const id = String(robj['id'] || '');
        const name = String(robj['name'] || rk.label);
        if (id) {
          rules.push({
            id,
            name: `${rk.label}: ${name}`,
            type: 'Connector Rule',
            description: `Attached ${rk.label} (ID: ${id})`,
            rawJson: robj,
          });
        }
      }
    }
    return rules;
  }

  async fetchSourceAssociatedBundle(
    sourceId: string,
    sourceName: string,
    sourceRawJson?: Record<string, unknown>
  ): Promise<SourceAssociatedObjects> {
    const [schemasRes, policiesRes, syncRes, subtypesRes] = await Promise.allSettled([
      this.fetchSourceSchemas(sourceId),
      this.fetchSourceProvisioningPolicies(sourceId),
      this.fetchSourceAttributeSyncConfig(sourceId),
      this.fetchSourceMachineAccountSubtypes(sourceId),
    ]);

    const schemas = schemasRes.status === 'fulfilled' ? schemasRes.value : [];
    const provisioningPolicies = policiesRes.status === 'fulfilled' ? policiesRes.value : [];
    const attributeSyncConfig = syncRes.status === 'fulfilled' ? syncRes.value : null;
    const machineAccountSubtypes = subtypesRes.status === 'fulfilled' ? subtypesRes.value : [];
    const rules = this.extractSourceRules(sourceRawJson);

    return {
      sourceId,
      sourceName,
      loading: false,
      loaded: true,
      schemas,
      provisioningPolicies,
      attributeSyncConfig,
      machineAccountSubtypes,
      rules,
    };
  }

  // ==========================================================================
  // Source Diagnostic & Operational Operations (Test, Peek, Ping, Logging)
  // ==========================================================================

  async testSourceConnection(sourceId: string): Promise<{ success: boolean; message: string; details?: unknown }> {
    try {
      const res = await this.plugin.post<any>(`/sources/v1/${sourceId}/connector/test-configuration`, {});
      const status = res?.status || (res?.success ? 'SUCCESS' : 'COMPLETED');
      return {
        success: true,
        message: `Connection test completed successfully (${status}).`,
        details: res,
      };
    } catch (err: unknown) {
      return {
        success: false,
        message: this.formatApiError(err) || 'Connector test connection failed.',
        details: err,
      };
    }
  }

  async peekSourceObjects(
    sourceId: string,
    objectType = 'account',
    maxResults = 10
  ): Promise<{ success: boolean; objects: any[]; message?: string }> {
    try {
      const res = await this.plugin.post<any>(`/sources/v1/${sourceId}/connector/peek-resource-objects`, {
        objectType,
        maxResults,
      });
      const items = Array.isArray(res) ? res : res?.items || [];
      return {
        success: true,
        objects: items,
        message: `Successfully peeked ${items.length} objects from source.`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        objects: [],
        message: this.formatApiError(err) || 'Failed to peek objects from source connector.',
      };
    }
  }

  async pingCluster(sourceId: string, clusterId?: string): Promise<{ success: boolean; message: string; details?: unknown }> {
    try {
      const res = await this.plugin.post<any>(`/sources/v1/${sourceId}/connector/ping-cluster`, {});
      return {
        success: true,
        message: 'Cluster ping succeeded. Virtual Appliances are online and responding.',
        details: res,
      };
    } catch (err: unknown) {
      if (clusterId) {
        try {
          const cRes = await this.plugin.post<any>(`/managed-clusters/v1/${clusterId}/ping`, {});
          return { success: true, message: 'Cluster ping succeeded via cluster ID.', details: cRes };
        } catch {}
      }
      return {
        success: false,
        message: this.formatApiError(err) || 'Cluster ping failed.',
      };
    }
  }

  async enableConnectorLogging(
    clusterId: string,
    durationMinutes = 30
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.put<any>(`/managed-clusters/v1/${clusterId}/log-config`, {
        durationMinutes,
        rootLevel: 'DEBUG',
      });
      return {
        success: true,
        message: `DEBUG logging enabled on cluster for ${durationMinutes} minutes.`,
      };
    } catch (err: unknown) {
      return {
        success: false,
        message: this.formatApiError(err) || 'Failed to update cluster log configuration.',
      };
    }
  }

  async getTaskStatus(taskId: string): Promise<any> {
    try {
      return await this.plugin.get<any>(`/task-status/v1/${encodeURIComponent(taskId)}`);
    } catch (err) {
      console.warn(`Failed to poll task ${taskId}:`, err);
      return null;
    }
  }

  extractCloudExternalId(raw?: Record<string, unknown>): string | undefined {
    if (!raw) return undefined;
    const connAttrs = raw['connectorAttributes'] as Record<string, unknown> | undefined;
    if (connAttrs && connAttrs['cloudExternalId']) {
      return String(connAttrs['cloudExternalId']);
    }
    if (raw['cloudExternalId']) {
      return String(raw['cloudExternalId']);
    }
    return undefined;
  }

  async resetSourceAccounts(sourceId: string, cloudExternalId?: string): Promise<{ success: boolean; message: string }> {
    // 1. Try modern v1 endpoint first
    try {
      await this.plugin.post(`/sources/v1/${sourceId}/remove-accounts`, {});
      return { success: true, message: `Accounts deletion queued successfully on ISC tenant for source ${sourceId}.` };
    } catch (v1Err: unknown) {
      // 2. Fallback to CC endpoint
      const targetId = cloudExternalId || sourceId;
      try {
        await this.plugin.post(`/cc/api/source/reset/${targetId}?skip=entitlements`, {});
        return { success: true, message: `Accounts reset via fallback CC API on ISC tenant for source ${sourceId}.` };
      } catch (ccErr: unknown) {
        throw new Error(this.formatApiError(v1Err) || this.formatApiError(ccErr) || 'Failed to reset source accounts');
      }
    }
  }

  async resetSourceEntitlements(sourceId: string, cloudExternalId?: string): Promise<{ success: boolean; message: string }> {
    // 1. Try modern v1 endpoint first
    try {
      await this.plugin.post(`/entitlements/v1/reset/sources/${sourceId}`, {});
      return { success: true, message: `Entitlements reset queued successfully on ISC tenant for source ${sourceId}.` };
    } catch (v1Err: unknown) {
      // 2. Fallback to CC endpoint
      const targetId = cloudExternalId || sourceId;
      try {
        await this.plugin.post(`/cc/api/source/reset/${targetId}?skip=accounts`, {});
        return { success: true, message: `Entitlements reset via fallback CC API on ISC tenant for source ${sourceId}.` };
      } catch (ccErr: unknown) {
        throw new Error(this.formatApiError(v1Err) || this.formatApiError(ccErr) || 'Failed to reset source entitlements');
      }
    }
  }

  async resetSource(sourceId: string, cloudExternalId?: string): Promise<{ success: boolean; message: string }> {
    // 1. Try modern v1 endpoints first
    try {
      await this.plugin.post(`/sources/v1/${sourceId}/remove-accounts`, {});
      await this.plugin.post(`/entitlements/v1/reset/sources/${sourceId}`, {});
      return { success: true, message: `Full source reset initiated via v1 APIs for source ${sourceId}.` };
    } catch (v1Err: unknown) {
      const targetId = cloudExternalId || sourceId;
      try {
        await this.plugin.post(`/cc/api/source/reset/${targetId}`, {});
        return { success: true, message: `Full source reset executed via fallback CC API for source ${sourceId}.` };
      } catch (ccErr: unknown) {
        throw new Error(this.formatApiError(v1Err) || this.formatApiError(ccErr) || 'Failed to execute full source reset');
      }
    }
  }

  async aggregateSourceAccounts(
    sourceId: string,
    cloudExternalId?: string,
    disableOptimization = false
  ): Promise<{ success: boolean; message: string; taskId?: string }> {
    const targetId = cloudExternalId || sourceId;
    try {
      const formData = new FormData();
      if (disableOptimization) {
        formData.append('disableOptimization', 'true');
      }
      const res = await this.plugin.post<any>(`/sources/v1/${sourceId}/load-accounts`, formData);
      const optText = disableOptimization ? ' (unoptimized)' : '';
      const taskId = res?.id || res?.taskResultId || res?.task?.id;
      const taskMsg = taskId ? ` (Task ID: ${taskId})` : '';
      return {
        success: true,
        message: `Account aggregation${optText} queued successfully on ISC tenant for source ${sourceId}${taskMsg}.`,
        taskId,
      };
    } catch (v1Err: unknown) {
      try {
        const query = disableOptimization ? '?disableOptimization=true' : '';
        const ccRes = await this.plugin.post<any>(`/cc/api/source/loadAccounts/${targetId}${query}`, {});
        const optText = disableOptimization ? ' (unoptimized)' : '';
        const taskId = ccRes?.id || ccRes?.taskResultId || ccRes?.task?.id;
        const taskMsg = taskId ? ` (Task ID: ${taskId})` : '';
        return {
          success: true,
          message: `Account aggregation${optText} started via CC API for source ${sourceId}${taskMsg}.`,
          taskId,
        };
      } catch (ccErr: unknown) {
        throw new Error(this.formatApiError(v1Err) || this.formatApiError(ccErr) || 'Failed to trigger account aggregation');
      }
    }
  }

  async aggregateSourceEntitlements(
    sourceId: string,
    cloudExternalId?: string
  ): Promise<{ success: boolean; message: string; taskId?: string }> {
    const targetId = cloudExternalId || sourceId;
    try {
      const res = await this.plugin.post<any>(`/sources/v1/${sourceId}/entitlements/import`, {});
      const taskId = res?.id || res?.taskResultId || res?.task?.id;
      const taskMsg = taskId ? ` (Task ID: ${taskId})` : '';
      return {
        success: true,
        message: `Entitlement aggregation queued successfully on ISC tenant for source ${sourceId}${taskMsg}.`,
        taskId,
      };
    } catch (v1Err: unknown) {
      try {
        const res = await this.plugin.post<any>(`/entitlements/v1/aggregate/sources/${sourceId}`, {});
        const taskId = res?.id || res?.taskResultId || res?.task?.id;
        const taskMsg = taskId ? ` (Task ID: ${taskId})` : '';
        return {
          success: true,
          message: `Entitlement aggregation queued successfully on ISC tenant for source ${sourceId}${taskMsg}.`,
          taskId,
        };
      } catch (v12Err: unknown) {
        try {
          const ccRes = await this.plugin.post<any>(`/cc/api/source/loadEntitlements/${targetId}`, {});
          const taskId = ccRes?.id || ccRes?.taskResultId || ccRes?.task?.id;
          const taskMsg = taskId ? ` (Task ID: ${taskId})` : '';
          return {
            success: true,
            message: `Entitlement aggregation started via CC API for source ${sourceId}${taskMsg}.`,
            taskId,
          };
        } catch (ccErr: unknown) {
          throw new Error(this.formatApiError(v1Err) || this.formatApiError(ccErr) || 'Failed to trigger entitlement aggregation');
        }
      }
    }
  }

  // ==========================================================================
  // Rules & Validation
  // ==========================================================================

  async validateConnectorRule(script: string): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const res = await this.plugin.post<any>('/connector-rules/v1/validate', {
        sourceCode: { script },
      });
      if (res?.status === 'OK' || res?.valid === true || !res?.errors?.length) {
        return { valid: true };
      }
      return { valid: false, errors: res.errors || ['Validation failed.'] };
    } catch (err: unknown) {
      return { valid: false, errors: [this.formatApiError(err) || 'Connector rule validation failed.'] };
    }
  }

  // ==========================================================================
  // Workflows (Toggle, Test, History)
  // ==========================================================================

  async setWorkflowEnabled(id: string, enabled: boolean): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.patch<any>(`/workflows/v1/${id}`, [
        { op: 'replace', path: '/enabled', value: enabled },
      ]);
      return {
        success: true,
        message: `Workflow ${enabled ? 'enabled' : 'disabled'} successfully.`,
      };
    } catch (err: unknown) {
      throw new Error(this.formatApiError(err) || 'Failed to update workflow enabled status.');
    }
  }

  async testWorkflow(id: string, inputPayload: Record<string, unknown>): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      const res = await this.plugin.post<any>(`/workflows/v1/${id}/test`, { input: inputPayload });
      return { success: true, result: res };
    } catch (err: unknown) {
      return { success: false, error: this.formatApiError(err) || 'Workflow test run failed.' };
    }
  }

  async fetchWorkflowExecutions(workflowId: string): Promise<any[]> {
    try {
      const raw = await this.plugin.get<any>(`/workflows/v1/${workflowId}/executions?limit=25`);
      return Array.isArray(raw) ? raw : raw?.items || [];
    } catch (err) {
      console.warn(`Failed to fetch executions for workflow ${workflowId}:`, err);
      return [];
    }
  }

  async fetchWorkflowExecutionHistory(executionId: string): Promise<any> {
    try {
      return await this.plugin.get<any>(`/workflow-executions/v1/${executionId}/history`);
    } catch (err) {
      console.warn(`Failed to fetch history for execution ${executionId}:`, err);
      return null;
    }
  }

  // ==========================================================================
  // Identity Profiles & Lifecycle States
  // ==========================================================================

  async fetchLifecycleStates(profileId: string): Promise<IscObjectItem[]> {
    try {
      const raw = await this.plugin.get<any[]>(`/identity-profiles/v1/${profileId}/lifecycle-states`);
      const items = Array.isArray(raw) ? raw : [];
      return items.map((ls: any) => ({
        id: String(ls.id || ls.technicalName || ''),
        name: String(ls.name || ls.technicalName || 'Lifecycle State'),
        type: 'Lifecycle State',
        description: ls.enabled ? 'Enabled' : 'Disabled',
        enabled: ls.enabled,
        rawJson: ls,
      }));
    } catch (err) {
      console.warn(`Failed to fetch lifecycle states for profile ${profileId}:`, err);
      return [];
    }
  }

  async createLifecycleState(
    profileId: string,
    state: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const res = await this.plugin.post<any>(`/identity-profiles/v1/${profileId}/lifecycle-states`, state);
      return { success: true, data: res };
    } catch (err) {
      return { success: false, error: this.formatApiError(err) || 'Failed to create lifecycle state.' };
    }
  }

  async updateLifecycleState(
    profileId: string,
    stateId: string,
    state: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    try {
      const res = await this.plugin.put<any>(`/identity-profiles/v1/${profileId}/lifecycle-states/${stateId}`, state);
      return { success: true, data: res };
    } catch (err) {
      return { success: false, error: this.formatApiError(err) || 'Failed to update lifecycle state.' };
    }
  }

  async deleteLifecycleState(profileId: string, stateId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.plugin.delete<any>(`/identity-profiles/v1/${profileId}/lifecycle-states/${stateId}`);
      return { success: true };
    } catch (err) {
      return { success: false, error: this.formatApiError(err) || 'Failed to delete lifecycle state.' };
    }
  }

  async refreshProfileIdentities(profileId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.post<any>(`/identity-profiles/v1/${profileId}/process-identities`, {});
      return { success: true, message: `Identity profile refresh queued successfully.` };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to refresh identities for profile.');
    }
  }

  // ==========================================================================
  // Identities & Accounts Management
  // ==========================================================================

  async searchIdentitiesServer(query: string, offset = 0, limit = 50): Promise<{ items: any[]; totalCount?: number }> {
    try {
      const res = await this.plugin.postWithResponse<any[]>('/search/v1', {
        indices: ['identities'],
        query: { query: query ? query : '*' },
        sort: ['name'],
      });
      const raw = Array.isArray(res.data) ? res.data : [];
      const page = raw.slice(offset, offset + limit);
      return { items: page, totalCount: res.totalCount ?? raw.length };
    } catch (err) {
      console.warn('Failed to search identities:', err);
      return { items: [], totalCount: 0 };
    }
  }

  async syncIdentityAttributes(identityId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.post<any>(`/identities/v1/${identityId}/synchronize-attributes`, {});
      return { success: true, message: 'Identity attributes synchronization triggered.' };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to synchronize attributes for identity.');
    }
  }

  async processIdentity(identityId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.post<any>(`/identities/v1/process`, { identityId });
      return { success: true, message: 'Identity re-processing queued successfully.' };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to process identity.');
    }
  }

  async deleteIdentity(identityId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.delete<any>(`/identities/v1/${identityId}`);
      return { success: true, message: 'Identity deleted successfully.' };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to delete identity.');
    }
  }

  async inviteIdentity(identityId: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.post<any>(`/identities/v1/invite`, { identityId });
      return { success: true, message: 'Invitation email dispatched to identity.' };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to invite identity.');
    }
  }

  async setIdentityLifecycleState(identityId: string, lifecycleState: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.post<any>(`/identities/v1/${identityId}/set-lifecycle-state`, { lifecycleState });
      return { success: true, message: `Lifecycle state updated to "${lifecycleState}".` };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to update lifecycle state.');
    }
  }

  async fetchIdentityAccounts(identityId: string): Promise<any[]> {
    try {
      const raw = await this.plugin.get<any[]>(`/accounts/v1?filters=identityId eq "${encodeURIComponent(identityId)}"`);
      return Array.isArray(raw) ? raw : [];
    } catch (err) {
      console.warn(`Failed to fetch accounts for identity ${identityId}:`, err);
      return [];
    }
  }

  async fetchIdentityEvents(identityId: string): Promise<any[]> {
    try {
      const res = await this.plugin.post<any[]>('/search/v1', {
        indices: ['events'],
        query: { query: `target.id:"${identityId}" OR actor.id:"${identityId}"` },
        sort: ['-created'],
      });
      return Array.isArray(res) ? res : [];
    } catch (err) {
      console.warn(`Failed to fetch events for identity ${identityId}:`, err);
      return [];
    }
  }

  async fetchIdentityAccess(identityId: string): Promise<{ roles: any[]; accessProfiles: any[]; entitlements: any[] }> {
    try {
      const res = await this.plugin.post<any[]>('/search/v1', {
        indices: ['identities'],
        query: { query: `id:"${identityId}"` },
      });
      if (Array.isArray(res) && res.length > 0) {
        const idn = res[0];
        const access = Array.isArray(idn.access) ? idn.access : [];
        const roles = access.filter((a: any) => a.type === 'ROLE');
        const accessProfiles = access.filter((a: any) => a.type === 'ACCESS_PROFILE');
        const entitlements = access.filter((a: any) => a.type === 'ENTITLEMENT');
        return { roles, accessProfiles, entitlements };
      }
      return { roles: [], accessProfiles: [], entitlements: [] };
    } catch (err) {
      console.warn(`Failed to fetch access for identity ${identityId}:`, err);
      return { roles: [], accessProfiles: [], entitlements: [] };
    }
  }

  async createAccessRequest(
    requestedFor: string,
    itemId: string,
    itemType: 'ROLE' | 'ACCESS_PROFILE' | 'ENTITLEMENT',
    requestType: 'GRANT_ACCESS' | 'REVOKE_ACCESS'
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.post<any>('/access-requests/v1', {
        requestedFor: [requestedFor],
        requestType,
        requestedItems: [
          {
            type: itemType,
            id: itemId,
            comment: 'Requested via Debug Console',
          },
        ],
      });
      return {
        success: true,
        message: `${requestType === 'GRANT_ACCESS' ? 'Grant' : 'Revoke'} request submitted successfully.`,
      };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Access request submission failed.');
    }
  }

  async fetchAccessRequestStatus(executionId?: string): Promise<any[]> {
    try {
      const url = executionId ? `/access-request-status/v1?filters=executionId eq "${executionId}"` : `/access-request-status/v1?limit=25`;
      const raw = await this.plugin.get<any>(url);
      return Array.isArray(raw) ? raw : raw?.items || [];
    } catch (err) {
      console.warn('Failed to fetch access request status:', err);
      return [];
    }
  }

  // Account Operations
  async enableAccount(id: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.post<any>(`/accounts/v1/${id}/enable`, {});
      return { success: true, message: `Account ${id} enabled successfully.` };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to enable account.');
    }
  }

  async disableAccount(id: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.post<any>(`/accounts/v1/${id}/disable`, {});
      return { success: true, message: `Account ${id} disabled successfully.` };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to disable account.');
    }
  }

  async unlockAccount(id: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.post<any>(`/accounts/v1/${id}/unlock`, {});
      return { success: true, message: `Account ${id} unlocked successfully.` };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to unlock account.');
    }
  }

  async reloadAccount(id: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.post<any>(`/accounts/v1/${id}/reload`, {});
      return { success: true, message: `Account ${id} aggregation reloaded.` };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to reload account.');
    }
  }

  async deleteAccount(id: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.delete<any>(`/accounts/v1/${id}`);
      return { success: true, message: `Account ${id} removed.` };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to delete account.');
    }
  }

  // ==========================================================================
  // SP-Config (Export / Import)
  // ==========================================================================

  async exportSpConfig(options: Record<string, unknown>): Promise<{ success: boolean; jobId?: string; error?: string }> {
    try {
      const res = await this.plugin.post<any>('/sp-config/v1/export', options);
      return { success: true, jobId: res?.jobId || res?.id };
    } catch (err) {
      return { success: false, error: this.formatApiError(err) || 'Failed to trigger sp-config export.' };
    }
  }

  async getSpConfigExportStatus(jobId: string): Promise<any> {
    try {
      return await this.plugin.get<any>(`/sp-config/v1/export/${jobId}`);
    } catch (err) {
      console.warn(`Failed to check export status for ${jobId}:`, err);
      return null;
    }
  }

  async downloadSpConfigExport(jobId: string): Promise<any> {
    try {
      return await this.plugin.get<any>(`/sp-config/v1/export/${jobId}/download`);
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to download export package.');
    }
  }

  async importSpConfig(fileContent: string, preview = false): Promise<{ success: boolean; jobId?: string; error?: string }> {
    try {
      const formData = new FormData();
      const blob = new Blob([fileContent], { type: 'application/json' });
      formData.append('data', blob, 'import.json');

      const res = await this.plugin.post<any>(`/sp-config/v1/import?preview=${preview}`, formData);
      return { success: true, jobId: res?.jobId || res?.id };
    } catch (err) {
      return { success: false, error: this.formatApiError(err) || 'Failed to import sp-config.' };
    }
  }

  async getSpConfigImportStatus(jobId: string): Promise<any> {
    try {
      return await this.plugin.get<any>(`/sp-config/v1/import/${jobId}`);
    } catch (err) {
      console.warn(`Failed to check import status for ${jobId}:`, err);
      return null;
    }
  }

  // ==========================================================================
  // Notification Templates (Send Test)
  // ==========================================================================

  async sendTestNotification(templateId: string, recipientEmail: string): Promise<{ success: boolean; message: string }> {
    try {
      await this.plugin.post<any>('/beta/send-test-notification', {
        key: templateId,
        medium: 'EMAIL',
        locale: 'en',
        recipientEmailList: [recipientEmail],
      });
      return { success: true, message: `Test notification sent to ${recipientEmail}.` };
    } catch (err) {
      throw new Error(this.formatApiError(err) || 'Failed to dispatch test notification.');
    }
  }

  // ==========================================================================
  // Transform Preview
  // ==========================================================================

  async fetchPreviewIdentities(limit = 100): Promise<PreviewIdentityOption[]> {
    try {
      const raw = await this.plugin.get<unknown[]>(`/public-identities/v1?limit=${limit}&sorters=name`);
      const items = Array.isArray(raw) ? raw : [];
      return items.map((i: any) => ({
        id: String(i.id || ''),
        name: String(i.name || i.alias || i.id || 'Unknown'),
        email: i.email || undefined,
        status: i.status || i.identityState || undefined,
        identityState: i.identityState || undefined,
      }));
    } catch (err) {
      console.warn('Failed to fetch preview identities:', err);
      return [];
    }
  }

  async previewTransformOnIdentity(
    identityId: string,
    transformName: string,
    attributeName = 'displayName'
  ): Promise<IdentityPreviewResult> {
    const payload = {
      identityId,
      identityAttributeConfig: {
        enabled: true,
        attributeTransforms: [
          {
            identityAttributeName: attributeName,
            transformDefinition: {
              type: 'reference',
              attributes: {
                id: transformName,
              },
            },
          },
        ],
      },
    };

    try {
      const res = await this.plugin.post<any>('/identity-profiles/v1/identity-preview', payload);
      const identityName = res?.identity?.name || identityId;
      const previewAttrs = Array.isArray(res?.previewAttributes) ? res.previewAttributes : [];
      const targetAttr = previewAttrs.find((a: any) => a.name === attributeName) || previewAttrs[0];

      let errorMessage: string | undefined;
      if (targetAttr?.errorMessages && targetAttr.errorMessages.length > 0) {
        errorMessage = targetAttr.errorMessages.map((e: any) => e.text || JSON.stringify(e)).join(' | ');
      }

      return {
        success: !errorMessage,
        identityName,
        attributeName: targetAttr?.name || attributeName,
        previousValue: targetAttr ? targetAttr.previousValue : null,
        newValue: targetAttr ? targetAttr.value : null,
        error: errorMessage,
        rawResponse: res,
      };
    } catch (err: unknown) {
      console.error('Failed to run identity-preview API:', err);
      return {
        success: false,
        identityName: identityId,
        attributeName,
        previousValue: null,
        newValue: null,
        error: this.formatApiError(err) || 'Failed to evaluate transform on tenant.',
      };
    }
  }

  private formatApiError(err: unknown): string {
    if (err instanceof PluginApiError && err.body) {
      if (typeof err.body === 'object') {
        const body = err.body as Record<string, unknown>;
        if (Array.isArray(body['messages'])) {
          return body['messages'].map((m: any) => m.text || JSON.stringify(m)).join(' | ');
        }
        if (body['message']) {
          return String(body['message']);
        }
        if (body['detailCode']) {
          return `Error ${body['detailCode']}: ${JSON.stringify(body)}`;
        }
      } else if (typeof err.body === 'string') {
        return err.body;
      }
    }
    return (err as Error)?.message || '';
  }
}
