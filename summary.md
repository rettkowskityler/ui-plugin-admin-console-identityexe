# Administrator Console UI Plugin - Executive Summary

## Background & Motivation
In SailPoint IdentityIQ (IIQ), the **Debug Pages** (`/debug/page.jsf`) served as the Swiss Army knife for administrators and architects to instantly inspect and patch backend XML objects.

In SailPoint Identity Security Cloud (ISC), objects such as Transforms, Connector Rules, Workflows, Roles, and Access Profiles are exposed via REST APIs.

The **Administrator Console UI Plugin** brings the speed and layout of the official **SailPoint VS Code extension** directly into the ISC browser UI, leveraging modern SailPoint REST APIs, specialized editors for Connector Rules and Transforms, and pre-commit safety guardrails.

---

## Key Capabilities

1. **VS Code-Style Workspace**:
   - **Activity Bar**: Quick toggle between Explorer, Search, and settings.
   - **Explorer Sidebar**: Collapsible tree containing all 13 ISC object types (`Sources`, `Roles`, `Entitlements`, `Access Profiles`, `Transforms`, `Connector Rules`, `Workflows`, `Identity Profiles`, `Accounts`, `Service Desk Integrations`, `Segments`, `SOD Policies`, `Identities`).
   - **Tabbed Editor Canvas**: Multi-document tab manager supporting multiple open objects, active focus, dirty indicators (`•`), and close buttons.
   - **Status Bar**: Real-time connected tenant indicator (`devrel-ga-25045`), active object endpoint, syntax mode, and encoding.

2. **Specialized Studios by Object Type**:
   - **Connector Rule Studio**:
     - Raw Java / BeanShell code editor for `sourceCode.script` without JSON string escaping.
     - Sub-tab navigation between raw BeanShell script and full Rule JSON envelope with automatic bidirectional synchronization.
     - Input Signature Inspector (`log`, `context`, `application`, `processedResponseObject`, etc.) with one-click insertion.
     - Common snippets library (logging, JDBC BuildMap, WebServices JSON parsing, try/catch wrap).
   - **Transform Studio**:
     - Transform JSON definition editor with format and minify actions.
     - **Client-Side Live Transform Test Simulator**: Evaluates transform operations directly in the browser against mock attributes without waiting for an ISC aggregation.
   - **General High-Fidelity JSON Editor**:
     - Standard JSON editor for Sources, Roles, Access Profiles, etc., with formatting, minification, and toggleable syntax-highlighted preview.

3. **Modern `/v1` REST API Catalog**:
   - Exclusively queries and manages objects via SailPoint's newest versioned `/v1` endpoints across all 13 object types.

4. **Pre-Commit GitHub-Style Differential Confirmation**:
   - In-memory diff engine computes line-by-line and word-level token modifications before changes are submitted.
   - Displays additions in green (`+`), deletions in red (`-`), with Unified and Split (side-by-side) modes.
   - Net line impact summary (`+X additions / -Y deletions`).
   - Dispatches changes to ISC via `PUT` or RFC 6902 `PATCH`.

5. **Professional Iconography & Zero Emojis**:
   - Built strictly with PrimeNG font icons (`pi pi-*`). Zero emojis in the UI.

6. **Native SailPoint Host Dark Mode Integration**:
   - Directly synchronizes in real time with the SailPoint ISC native user theme (toggled via the user profile menu in the upper-right corner of the SailPoint navigation bar).
   - Eliminated redundant in-plugin manual toggles so the single native switch controls the entire UI seamlessly.
   - Listens to host DOM classes (`.spds-dark`, `.dark`), attributes (`data-theme`), and background luminance via `MutationObserver` and storage events.
   - Dynamic logo switching:
     - Dark Mode: `IdentityEXE2-06.svg` (white typography on cyber dark `#02081b`).
     - Light Mode: `IdentityEXE2-05.svg` (navy `#02081b` typography on clean light `#ffffff`).
   - Unified CSS custom properties powering editor canvas, syntax colors, tabs, gutters, scrollbars, and diff modals.

7. **Deployment Status**:
   - Successfully uploaded to tenant `devrel-ga-25045` via SailPoint CLI (`sail ui-plugins upload`).
   - Plugin Instance ID: `dcc0c183-d183-42bf-af83-a5b498b4f888`
   - Active Asset Bundle: `2d85818a-5e8c-4599-b650-42bf10e7588e`
   - Live URL: [https://devrel-ga-25045.identitynow-demo.com/ui/plugin/dcc0c183-d183-42bf-af83-a5b498b4f888](https://devrel-ga-25045.identitynow-demo.com/ui/plugin/dcc0c183-d183-42bf-af83-a5b498b4f888)
