# Administrator Console UI Plugin

> **SailPoint Identity Security Cloud (ISC) VS Code-Style Backend Object Browser, Specialized Studios & Differential Change Engine**  
> Inspired by the official SailPoint VS Code extension and the classic **IdentityIQ (IIQ) Debug Console**, re-imagined with modern SailPoint REST APIs, specialized editors for Connector Rules and Transforms, and a pre-commit GitHub-style differential review engine.

---

## Live Plugin Details

- **Tenant:** `devrel-ga-25045` (`https://devrel-ga-25045.identitynow-demo.com`)
- **Plugin Name:** `Administrator Console`
- **Plugin Alias:** `isc-debug-mode-identityexe`
- **Plugin Instance ID:** `dcc0c183-d183-42bf-af83-a5b498b4f888`
- **Active Asset Bundle ID:** `fd4eae1e-5652-44c8-8b56-72d9d47b61ab`
- **Live In-Tenant URL:**  
  [https://devrel-ga-25045.identitynow-demo.com/ui/plugin/dcc0c183-d183-42bf-af83-a5b498b4f888](https://devrel-ga-25045.identitynow-demo.com/ui/plugin/dcc0c183-d183-42bf-af83-a5b498b4f888)

---

## What This Plugin Solves

In SailPoint IdentityIQ, the `/debug` console is an indispensable tool for identity architects, developers, and engineers to inspect, debug, and patch low-level XML configurations directly in the backend.

In SailPoint Identity Security Cloud (ISC), objects are governed through REST APIs. Admins and developers often struggle to:
1. **Browse and inspect raw backend definitions** across all configuration types in one centralized VS Code-style environment without leaving the browser.
2. **Develop and test complex transforms and rules** — standard generic JSON viewers lack domain-specific tools like Java/BeanShell syntax support or client-side transform evaluation.
3. **Trigger administrative source actions seamlessly** — perform VS Code-style operations such as **Aggregate Accounts**, **Aggregate Entitlements**, **Aggregate Accounts without Optimization**, **Reset Accounts**, **Reset Entitlements**, and **Reset Source** directly from the UI with pre-execution safety confirmations.
4. **Prevent accidental misconfigurations** — unlike standard tools that blindly overwrite backend objects, this plugin enforces a **pre-commit GitHub-like diff review** showing exact line additions, deletions, and word-level token highlights before changes are pushed to the live tenant.

---

## Architecture & Layout

### 1. VS Code Workbench Layout
- **Activity Bar (Far Left Strip):** Single dedicated **Object Browser** toggle button that expands or collapses the sidebar.
- **Adjustable Object Workspace Explorer Pane:** Interactive draggable splitter bar allowing users to expand the sidebar from 220px to over 1000px to accommodate long source names, nested schemas, and rule names. Features live highlight knob, double-click to reset (320px), and automatic `localStorage` persistence.
- **Applications Dropdown & Source Apps:** Dedicated **Applications** category backed by `/source-apps/v1` and ISC Search (`/search/v1`). Displays live tenant applications, bound sources, and access profiles with real-time total count and search filtering.
- **Forms Dropdown & Editor:** Dedicated **Forms** (`form-definitions/v1`) expandable category with real-time tenant count, instant filtering, pre-commit diff review, and RFC 6902 JSON Patch deployment.
- **Source Associated Objects Tree & Quick Bar with VS Code Actions:** When viewing a Source tab, the top quick bar houses official SailPoint VS Code extension API actions:
  - **Aggregate Accounts:** Triggers optimized delta account aggregation (`POST /sources/v1/{id}/load-accounts` or `POST /cc/api/source/loadAccounts/{targetId}`).
  - **Aggregate Entitlements:** Triggers entitlement discovery and catalog import (`POST /sources/v1/{id}/entitlements/import` or `POST /cc/api/source/loadEntitlements/{targetId}`).
  - **Aggregate Accounts without Optimization:** Forces full re-evaluation and re-correlation of all source accounts bypassing delta cache (`POST /sources/v1/{id}/load-accounts` with `disableOptimization: true`).
  - **Reset Accounts:** Calls the modern endpoints (`POST /sources/v1/{id}/remove-accounts` or fallback `POST /cc/api/source/reset/{id}?skip=entitlements`) to delete all aggregated accounts.
  - **Reset Entitlements:** Calls the modern endpoints (`POST /entitlements/v1/reset/sources/{id}` or fallback `POST /cc/api/source/reset/{id}?skip=accounts`) to purge discovered entitlements.
  - **Reset Source:** Clears both accounts and entitlements in one operation.
  - **Safety Modal:** Confirms action details (Source Name, Source ID, Cloud External ID, and optimization notes) before triggering tenant backend operations.
- **Global View / Edit Mode Switcher:** Unified mode toggle at the top of the Object Workspace pane (`View` vs `Edit`). Toggling switches all open object tabs simultaneously between syntax-highlighted read-only view and interactive editing mode.
- **In-Window Toolbars & Reload Button:**
  - **Reload Button:** Re-fetches the latest live JSON and script definition directly from the ISC tenant for the active tab, clearing dirty indicators.
  - **Dynamic Save Button:** Save / Review Diff button remains neutral and muted when clean, and only illuminates with an energetic green glow when changes are detected (`tab.isDirty === true`).
- **Tabbed Editor Workspace:** Multi-tab document manager supporting multiple open objects, active focus, dirty indicators (`•`), and close buttons.
- **Status Bar (Bottom):** Connected tenant indicator (`devrel-ga-25045`), active object endpoint, syntax mode, encoding, and IdentityEXE branding.

### 2. Specialized Studios by Object Type
Depending on the ISC object type opened, the workspace dynamically mounts a purpose-built editor:

#### A. Connector Rule Studio (`connector-rules`)
- **Java / BeanShell Syntax Highlighting:** Comprehensive lexer tokenization with accurate colorization for keywords (`public`, `class`, `return`, etc.), built-in SailPoint context variables (`log`, `context`, `application`, etc.), classes and types (`String`, `Map`, `GeneralException`, etc.), method calls, annotations, strings, numbers, booleans, and multi-line comments.
- **Global View/Edit Synchronization:** Respects the global workspace mode (Syntax View vs Interactive Java Editor).
- **Unescaped Java / BeanShell Editor:** Edit rule logic (`sourceCode.script`) directly without dealing with JSON string escaping.
- **Sub-Tab Navigation:** Seamlessly toggle between raw BeanShell script and full Rule JSON envelope with real-time bidirectional synchronization.
- **Input Signature Inspector:** Automatically discovers declared input variables (`log`, `context`, `application`, `processedResponseObject`, `rawResponseObject`, etc.) and allows one-click insertion into the editor.
- **Snippet Library:** One-click insertion of common SailPoint rule patterns (Debug Logging, WebServices JSON parsing, JDBC BuildMap, Exception handling).

#### B. Transform Studio (`transforms`)
- **Transform JSON Definition Editor:** Real-time JSON syntax highlighting while actively typing, formatting, minification, and real-time syntax validation.
- **Live SailPoint Identity Preview API Simulator (`POST /beta/identity-profiles/identity-preview`):**
  - **Live Identity Dropdown:** Populates live tenant identities from `/v3/public-identities` with search filtering, avatar initials, display names, email addresses, and lifecycle status badges, matching native Identity Profile preview semantics.
  - **Target Attribute Selector:** Choose any target identity attribute (e.g. `displayName`, `email`, `uid`, `firstname`, `lastname`) to test into.
  - **Before vs After Visual Diff:** Displays `previousValue` (current identity attribute value) against `value` (live evaluated transform result) with visual diff indicators.
  - **Engine Mode Toggle:** Seamlessly toggle between live SailPoint Preview API and offline client-side Sandbox simulation.
- **Client-Side Sandbox Fallback:** Offline evaluation for `lower`, `upper`, `trim`, `substring`, `replace`, `concat`, `lookup`, `firstValid`, `dateFormat`, `dateCompare`, `decomposeDiacriticalMarks`.

#### C. High-Fidelity JSON Editor (`sources`, `roles`, `access-profiles`, `entitlements`, `forms`, `applications`, etc.)
- Real-time JSON syntax highlighting in View mode and interactive editing backdrop in Edit mode.
- Line numbers gutter, Tab key indentation, formatting with 2 spaces, and minification.
- Copy to clipboard, live object reload, and pre-commit diff review trigger.

### 3. Modern REST API Catalog (All 15 ISC Object Types)
1. **Sources** (`/sources/v1`) — Authoritative and target sources, connector schemas, and aggregation settings.
2. **Roles** (`/roles/v1`) — Business roles, automated criteria trees, access profile bindings.
3. **Entitlements** (`/entitlements/v1`) — Source-scoped entitlements, group memberships, permissions.
4. **Access Profiles** (`/access-profiles/v1`) — Entitlement sets and provisioning profiles.
5. **Applications & User Apps** (`/user-apps/v1/all` / `/v3/search`) — App Center applications, user apps, access profile bindings.
6. **Transforms** (`/transforms/v1`) — Calculated identity attributes, lookups, and date logic.
7. **Connector Rules** (`/connector-rules/v1`) — Cloud connector BeanShell/Java rules.
8. **Workflows** (`/workflows/v1`) — Event-driven triggers, actions, and branching logic.
9. **Forms** (`/beta/form-definitions`) — Custom interactive forms, input elements, validation rules, and conditional logic.
10. **Identity Profiles** (`/identity-profiles/v1`) — Identity mapping matrices and lifecycle configs.
11. **Accounts** (`/accounts/v1`) — Aggregated accounts and source correlations.
12. **Service Desk Integrations** (`/service-desk-integrations/v1`) — ServiceNow, Jira Service Desk integrations.
13. **Segments** (`/segments/v1`) — Visibility scopes and access boundary definitions.
14. **SOD Policies** (`/sod-policies/v1`) — Separation of Duties conflict policies.
15. **Identities (Read-Only)** (`/public-identities/v1`) — Tenant identities and manager links.

### 4. GitHub-Style Differential Confirmation
Before any modified object is committed to ISC:
- Generates a Myers/LCS diff between the current tenant baseline and staged edits.
- Displays line additions in green (`+`), deletions in red (`-`), and word-level token highlights.
- Toggle between **Unified Diff** and **Split (Side-by-Side)** modes.
- Summary metrics: `+X additions`, `-Y deletions`, `Z modified lines`.
- Live tenant impact warning banner.
- Pushes changes via `PUT` or RFC 6902 `PATCH`.

### 5. API & Network Activity Log Viewer
- **Dedicated Activity Bar Route:** Quick-access icon on the left Activity Bar with a live traffic counter badge and pulsing red warning badge when errors occur.
- **Full Inbound/Outbound Interception:** Captures 100% of REST API traffic through `SailpointPluginService`, logging method, path, status, latency, request/response headers, payloads, and error details.
- **Executable cURL Snippets:** One-click copy of complete bash `curl` commands formatted with authentication headers and escaped payloads.
- **Real-Time Traffic Metrics:** Tracks total calls, `2xx OK` successes, `4xx` client errors, `5xx` server errors, and average roundtrip latency in milliseconds.
- **Multi-Filter & Search:** Filter by HTTP Method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), Status (`2xx`, `4xx`, `5xx`, `ERR`), Log Type (`API Calls`, `Events`), and full-text keyword search across endpoints and payloads.
- **Pause/Resume & Export:** Toggle live recording at any time, clear history, or export complete network session logs as a structured JSON file.
- **Status Bar Integration:** Clickable live API count indicator in the workbench bottom status bar for immediate console access.

### 6. Native SailPoint Host Dark Mode Integration
- **Direct SailPoint Host Sync:** The plugin seamlessly synchronizes in real time with the SailPoint ISC native user theme (toggled via the user profile menu in the upper-right corner of the SailPoint navigation bar).
- **Zero Redundant Toggles:** Removes unnecessary duplicate in-plugin toggle buttons, allowing the native SailPoint UI switch to drive the entire workspace experience.
- **Multi-Vector Detection & Live MutationObserver:** Evaluates host DOM classes (`.spds-dark`, `.dark`), attributes (`data-theme`), and background luminance. Reacts immediately to profile menu toggles via `MutationObserver`, storage events, and media query listeners.
- **Adaptive IdentityEXE Branding:**
  - **Dark Mode:** Displays `IdentityEXE2-06.svg` with high-contrast white logo typography against deep cyber darks (`#02081b`, `#061124`).
  - **Light Mode:** Dynamically swaps to `IdentityEXE2-05.svg` with sharp navy typography (`#02081b`) against crisp modern light surfaces (`#f8fafc`, `#ffffff`).
- **Full Workspace Adaptation:** Switches CSS custom properties across all editors, gutters, diff views, and dialogs.

### 7. Professional UI Iconography & Edge-to-Edge Layout
- **Zero Emojis:** Pure PrimeNG font icons (`pi pi-*`) used exclusively throughout the entire interface.
- **Zero Letterboxing:** Shell styling is configured for full edge-to-edge canvas width and height inside the SailPoint iframe.

---

## SailPoint CLI Commands

```powershell
# 1. Enable experimental UI plugins feature flag
$env:SAIL_EXPERIMENTAL_UI_PLUGINS = "1"

# 2. Offline manifest validation
sail ui-plugins validate-manifest

# 3. Compile Angular assets
npm run build

# 4. Deploy assets to SailPoint CDN
sail ui-plugins upload --env devrel-ga-25045

# 5. List deployed UI plugins in tenant
sail ui-plugins list --env devrel-ga-25045
```
