export type IscObjectKey =
  | 'sources'
  | 'roles'
  | 'entitlements'
  | 'access-profiles'
  | 'transforms'
  | 'connector-rules'
  | 'workflows'
  | 'forms'
  | 'applications'
  | 'identity-profiles'
  | 'accounts'
  | 'identity-attributes'
  | 'search-attributes'
  | 'machine-identities'
  | 'service-desk-integrations'
  | 'segments'
  | 'sod-policies'
  | 'public-identities'
  | 'notification-templates';

export interface IscObjectType {
  key: IscObjectKey;
  label: string;
  category: 'Sources & Accounts' | 'Access & Roles' | 'Data & Transforms' | 'Automation & Rules' | 'Governance & Policy' | 'Communications';
  endpoint: string;
  description: string;
  icon: string;
  supportsCreate?: boolean;
  supportsUpdate: boolean;
  supportsDelete?: boolean;
  supportsClone?: boolean;
  supportsExport?: boolean;
  pageable?: boolean;
  updateMethod: 'PUT' | 'PATCH';
  idField: string;
  nameField: string;
  typeField?: string;
  openWebUrl?: (item: IscObjectItem, baseUrl: string) => string | null;
}

export function resolveAdminWebUrl(baseUrlOrOrg: string, hash: string): string {
  const base = baseUrlOrOrg.startsWith('http')
    ? baseUrlOrOrg.replace(/\/+$/, '')
    : `https://${baseUrlOrOrg}.identitynow.com`;
  return `${base}/ui/admin#${hash}`;
}

export interface SpConfigTypeOption {
  type: string;
  label: string;
  description: string;
  icon: string;
}

export const SP_CONFIG_EXPORT_TYPES: SpConfigTypeOption[] = [
  { type: 'SOURCE', label: 'Sources', description: 'Connector configurations, schemas, and provisioning policies', icon: 'pi pi-database' },
  { type: 'TRANSFORM', label: 'Transforms', description: 'Identity attribute pipelines and data transformers', icon: 'pi pi-bolt' },
  { type: 'RULE', label: 'Rules', description: 'Connector rules and cloud rules', icon: 'pi pi-code' },
  { type: 'WORKFLOW', label: 'Workflows', description: 'Event-driven triggers, actions, and operator logic', icon: 'pi pi-sitemap' },
  { type: 'ROLE', label: 'Roles', description: 'Role definitions, membership criteria, and access assignments', icon: 'pi pi-id-card' },
  { type: 'ACCESS_PROFILE', label: 'Access Profiles', description: 'Source-bound entitlement bundles and approvals', icon: 'pi pi-shield' },
  { type: 'FORM_DEFINITION', label: 'Forms', description: 'Custom forms, user input fields, and workflow forms', icon: 'pi pi-file-edit' },
  { type: 'IDENTITY_PROFILE', label: 'Identity Profiles', description: 'Authoritative mappings and identity lifecycle states', icon: 'pi pi-user' },
  { type: 'SOD_POLICY', label: 'SOD Policies', description: 'Separation of duties conflict detection rules', icon: 'pi pi-exclamation-triangle' },
  { type: 'NOTIFICATION_TEMPLATE', label: 'Email Templates', description: 'Notification email templates and formatting', icon: 'pi pi-envelope' },
  { type: 'SERVICE_DESK_INTEGRATION', label: 'Service Desk', description: 'ServiceNow, Jira, and ticketing integrations', icon: 'pi pi-ticket' },
  { type: 'TRIGGER_SUBSCRIPTION', label: 'Trigger Subscriptions', description: 'Event trigger listeners and HTTP webhooks', icon: 'pi pi-bell' },
];

export interface PageParams {
  offset: number;
  limit: number;
  query?: string;
  sorters?: string;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface TrackedTask {
  id: string;
  name: string;
  type: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  started: Date;
  completed?: Date;
  targetId?: string;
  targetName?: string;
  detail?: string;
}

export interface IscObjectItem {
  id: string;
  name: string;
  type?: string;
  description?: string;
  modified?: string;
  created?: string;
  internal?: boolean;
  enabled?: boolean;
  rawJson: Record<string, unknown>;
}

export interface EditorTab {
  id: string;
  objectId: string;
  name: string;
  objectType: IscObjectType;
  activeItem: IscObjectItem;
  originalCode: string;
  editedCode: string;
  originalScript?: string;
  editedScript?: string;
  isDirty: boolean;
  activeSubTab: 'editor' | 'script' | 'simulator' | 'json';
  jsonError: string;
  editLayout?: 'editor' | 'split';
  sourceId?: string;
  sourceName?: string;
  associatedType?: 'schema' | 'provisioning-policy' | 'attribute-sync-config' | 'machine-account-subtype' | 'rule';
}

export interface PreviewIdentityOption {
  id: string;
  name: string;
  email?: string;
  status?: string;
  identityState?: string;
}

export interface IdentityPreviewResult {
  success: boolean;
  identityName: string;
  attributeName: string;
  previousValue: string | null;
  newValue: string | null;
  error?: string;
  rawResponse?: unknown;
}

export interface SourceAssociatedObjects {
  sourceId: string;
  sourceName: string;
  loading: boolean;
  loaded: boolean;
  schemas: IscObjectItem[];
  provisioningPolicies: IscObjectItem[];
  attributeSyncConfig: IscObjectItem | null;
  machineAccountSubtypes: IscObjectItem[];
  rules: IscObjectItem[];
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'header';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
  subHighlights?: Array<{ text: string; isHighlight: boolean }>;
}

export interface DiffResult {
  additions: number;
  deletions: number;
  changes: number;
  lines: DiffLine[];
  leftLines: DiffLine[];  // for side-by-side
  rightLines: DiffLine[]; // for side-by-side
  isIdentical: boolean;
}

export const ISC_OBJECT_TYPES: IscObjectType[] = [
  {
    key: 'transforms',
    label: 'Transforms',
    category: 'Data & Transforms',
    endpoint: '/transforms/v1',
    description: 'Calculated identity attributes, string operations, lookups, and date logic',
    icon: 'pi pi-sliders-h',
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsClone: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PUT',
    idField: 'id',
    nameField: 'name',
    typeField: 'type',
    openWebUrl: (_, base) => resolveAdminWebUrl(base, 'admin:identities:transforms'),
  },
  {
    key: 'connector-rules',
    label: 'Connector Rules',
    category: 'Automation & Rules',
    endpoint: '/connector-rules/v1',
    description: 'BeanShell/Java rules for Web Services, JDBC BuildMap, and Provisioning hooks',
    icon: 'pi pi-code',
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PUT',
    idField: 'id',
    nameField: 'name',
    typeField: 'type',
  },
  {
    key: 'sources',
    label: 'Sources',
    category: 'Sources & Accounts',
    endpoint: '/sources/v1',
    description: 'Authoritative and target source configurations, connector attributes, schemas, and aggregation settings',
    icon: 'pi pi-database',
    supportsCreate: false,
    supportsUpdate: true,
    supportsDelete: false,
    supportsClone: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PATCH',
    idField: 'id',
    nameField: 'name',
    typeField: 'type',
    openWebUrl: (item, base) => resolveAdminWebUrl(base, `admin:connections:sources:${item.id}`),
  },
  {
    key: 'roles',
    label: 'Roles',
    category: 'Access & Roles',
    endpoint: '/roles/v1',
    description: 'Business roles, automated criteria trees, access profile bindings, and dimensions',
    icon: 'pi pi-id-card',
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PATCH',
    idField: 'id',
    nameField: 'name',
    openWebUrl: (item, base) => resolveAdminWebUrl(base, `admin:access:roles:${item.id}`),
  },
  {
    key: 'entitlements',
    label: 'Entitlements',
    category: 'Access & Roles',
    endpoint: '/entitlements/v1',
    description: 'Source-scoped entitlements, group memberships, permissions, and requestable privileges',
    icon: 'pi pi-verified',
    supportsCreate: false,
    supportsUpdate: true,
    supportsDelete: false,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PATCH',
    idField: 'id',
    nameField: 'name',
    typeField: 'attribute',
  },
  {
    key: 'access-profiles',
    label: 'Access Profiles',
    category: 'Access & Roles',
    endpoint: '/access-profiles/v1',
    description: 'Source-scoped entitlement groupings and provisioning access profile definitions',
    icon: 'pi pi-key',
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PATCH',
    idField: 'id',
    nameField: 'name',
    openWebUrl: (item, base) => resolveAdminWebUrl(base, `admin:access:profiles:${item.id}`),
  },
  {
    key: 'applications',
    label: 'Applications',
    category: 'Access & Roles',
    endpoint: '/source-apps/v1',
    description: 'Tenant source applications, access profile mappings, and app center definitions',
    icon: 'pi pi-th-large',
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PATCH',
    idField: 'id',
    nameField: 'name',
    typeField: 'type',
    openWebUrl: (item, base) => resolveAdminWebUrl(base, `admin:apps:detail:${item.id}`),
  },
  {
    key: 'workflows',
    label: 'Workflows',
    category: 'Automation & Rules',
    endpoint: '/workflows/v1',
    description: 'Event-driven triggers, actions, branching logic, and external webhooks',
    icon: 'pi pi-sitemap',
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PUT',
    idField: 'id',
    nameField: 'name',
    openWebUrl: (item, base) => resolveAdminWebUrl(base, `admin:automation:workflows:${item.id}`),
  },
  {
    key: 'forms',
    label: 'Forms',
    category: 'Automation & Rules',
    endpoint: '/form-definitions/v1',
    description: 'Custom interactive forms, input elements, validation rules, and conditional logic',
    icon: 'pi pi-list-check',
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PATCH',
    idField: 'id',
    nameField: 'name',
    openWebUrl: (item, base) => resolveAdminWebUrl(base, `admin:automation:forms:${item.id}`),
  },
  {
    key: 'identity-profiles',
    label: 'Identity Profiles',
    category: 'Sources & Accounts',
    endpoint: '/identity-profiles/v1',
    description: 'Identity attribute mapping matrices, priority, and lifecycle state configs',
    icon: 'pi pi-users',
    supportsCreate: false,
    supportsUpdate: true,
    supportsDelete: false,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PATCH',
    idField: 'id',
    nameField: 'name',
    openWebUrl: (item, base) => resolveAdminWebUrl(base, `admin:identities:identity-profiles:${item.id}`),
  },
  {
    key: 'accounts',
    label: 'Accounts',
    category: 'Sources & Accounts',
    endpoint: '/accounts/v1',
    description: 'Aggregated accounts, source correlations, attributes, and account statuses',
    icon: 'pi pi-user-plus',
    supportsCreate: false,
    supportsUpdate: false,
    supportsDelete: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PATCH',
    idField: 'id',
    nameField: 'name',
  },
  {
    key: 'identity-attributes',
    label: 'Identity Attributes',
    category: 'Data & Transforms',
    endpoint: '/identity-attributes/v1',
    description: 'Global identity attributes, searchable flags, and authoritative sources',
    icon: 'pi pi-id-card',
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PUT',
    idField: 'name',
    nameField: 'displayName',
    openWebUrl: (_, base) => resolveAdminWebUrl(base, 'admin:identities:identity-attributes'),
  },
  {
    key: 'search-attributes',
    label: 'Search Attributes',
    category: 'Data & Transforms',
    endpoint: '/accounts/v1/search-attribute-config',
    description: 'Account attributes configured for identity search indexing',
    icon: 'pi pi-search-plus',
    supportsCreate: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PATCH',
    idField: 'name',
    nameField: 'name',
  },
  {
    key: 'machine-identities',
    label: 'Machine Identities',
    category: 'Sources & Accounts',
    endpoint: '/machine-identities/v1',
    description: 'Service accounts, bots, and non-human identities governance',
    icon: 'pi pi-server',
    supportsCreate: false,
    supportsUpdate: true,
    supportsDelete: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PATCH',
    idField: 'id',
    nameField: 'name',
  },
  {
    key: 'notification-templates',
    label: 'Notification Templates',
    category: 'Communications',
    endpoint: '/notification-templates/v1',
    description: 'Email, Slack, and Teams templates with HTML editor, preview, and test send',
    icon: 'pi pi-envelope',
    supportsCreate: false,
    supportsUpdate: true,
    supportsDelete: false,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PUT',
    idField: 'key',
    nameField: 'name',
    typeField: 'medium',
    openWebUrl: (_, base) => resolveAdminWebUrl(base, 'admin:global:email-templates'),
  },
  {
    key: 'service-desk-integrations',
    label: 'Service Desk Integrations',
    category: 'Automation & Rules',
    endpoint: '/service-desk-integrations/v1',
    description: 'ServiceNow, Jira Service Desk, and ITSM ticket dispatch configurations',
    icon: 'pi pi-ticket',
    supportsCreate: false,
    supportsUpdate: true,
    supportsDelete: true,
    pageable: true,
    updateMethod: 'PUT',
    idField: 'id',
    nameField: 'name',
    typeField: 'type',
    openWebUrl: (item, base) => resolveAdminWebUrl(base, `admin:connections:service-desk:${item.id}`),
  },
  {
    key: 'segments',
    label: 'Segments',
    category: 'Governance & Policy',
    endpoint: '/segments/v1',
    description: 'Administrative visibility scopes and access boundary definitions',
    icon: 'pi pi-shield',
    supportsCreate: false,
    supportsUpdate: true,
    supportsDelete: true,
    pageable: true,
    updateMethod: 'PATCH',
    idField: 'id',
    nameField: 'name',
  },
  {
    key: 'sod-policies',
    label: 'SOD Policies',
    category: 'Governance & Policy',
    endpoint: '/sod-policies/v1',
    description: 'Separation of Duties conflict policies and toxic combination rules',
    icon: 'pi pi-exclamation-triangle',
    supportsCreate: false,
    supportsUpdate: true,
    supportsDelete: true,
    pageable: true,
    updateMethod: 'PUT',
    idField: 'id',
    nameField: 'name',
  },
  {
    key: 'public-identities',
    label: 'Identities',
    category: 'Sources & Accounts',
    endpoint: '/public-identities/v1',
    description: 'Tenant identities, attributes, lifecycle states, and access management',
    icon: 'pi pi-user',
    supportsCreate: false,
    supportsUpdate: false,
    supportsDelete: true,
    supportsExport: true,
    pageable: true,
    updateMethod: 'PATCH',
    idField: 'id',
    nameField: 'name',
    openWebUrl: (item, base) => resolveAdminWebUrl(base, `admin:identities:identities:${item.id}`),
  },
];

export const NEW_OBJECT_TEMPLATES: Record<string, (name: string) => Record<string, unknown>> = {
  transforms: (name) => ({
    name,
    type: 'lower',
    attributes: {
      input: {
        type: 'accountAttribute',
        attributes: {
          sourceName: 'Active Directory',
          attributeName: 'sAMAccountName',
        },
      },
    },
  }),
  roles: (name) => ({
    name,
    description: 'Business role created via Debug Console',
    enabled: true,
    requestable: false,
    owner: { type: 'IDENTITY', id: '' },
    accessProfiles: [],
    membership: { type: 'STANDARD', criteria: null },
  }),
  'access-profiles': (name) => ({
    name,
    description: 'Access profile created via Debug Console',
    enabled: true,
    requestable: false,
    owner: { type: 'IDENTITY', id: '' },
    source: { type: 'SOURCE', id: '' },
    entitlements: [],
  }),
  workflows: (name) => ({
    name,
    description: 'Workflow created via Debug Console',
    enabled: false,
    definition: {
      start: 'Send Email',
      steps: {
        'Send Email': {
          type: 'action',
          actionId: 'sp:send-email',
          attributes: {
            recipientId: '$.trigger.recipient',
            body: 'Hello world',
            subject: 'Notification',
          },
          nextStep: 'success',
        },
        success: { type: 'success' },
      },
    },
    trigger: { type: 'EVENT', attributes: { id: 'idn:identity-created' } },
  }),
  'connector-rules': (name) => ({
    name,
    type: 'BuildMap',
    signature: {
      input: [{ name: 'rawResponseObject', description: 'Raw map' }],
      output: { name: 'processedResponseObject', description: 'Processed map' },
    },
    sourceCode: {
      version: '1.0',
      script: `import java.util.Map;\n\n// Rule: ${name}\nlog.info("Executing rule logic");\nreturn processedResponseObject;\n`,
    },
  }),
  forms: (name) => ({
    name,
    title: name,
    description: 'Custom form definition',
    formElements: [
      {
        id: 'field1',
        element: 'text',
        name: 'field1',
        label: 'Field 1',
        config: { required: true },
      },
    ],
  }),
  applications: (name) => ({
    name,
    description: 'Application created via Debug Console',
    enabled: true,
    accountSource: { id: '', type: 'SOURCE' },
  }),
  'identity-attributes': (name) => ({
    name,
    displayName: name,
    standard: false,
    type: 'string',
    multi: false,
    searchable: true,
  }),
  'search-attributes': (name) => ({
    name,
    displayName: name,
    applicationId: '',
  }),
};
