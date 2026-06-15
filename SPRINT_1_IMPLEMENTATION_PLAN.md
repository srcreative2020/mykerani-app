# MYKERANI Sprint 1 Implementation Plan

This plan details the folder structures, schema bindings, API paths, and step-by-step development tasks required to build Sprint 1 (Phases 1, 2, and 3) of **MYKERANI (AI Financial Assistant)**.

---

## 1. Folder Structure

A modular, clean React/TypeScript + Express/Vite full-stack structure:

```
/
├── .env.example                       # Documented environment variables
├── .gitignore                         # Build and dependency ignore definitions
├── package.json                       # Service dependencies and workspace runner scripts
├── tsconfig.json                      # Type system configuration
├── vite.config.ts                     # Vite build and asset pipelines
├── metadata.json                      # Platform configuration and frame permissions
│
├── server.ts                          # Express server entry point (Vite middleware integration)
│
├── src/
│   ├── main.tsx                       # React application entry client
│   ├── index.css                      # Global Tailwind CSS 4 file with custom font layers
│   ├── App.tsx                        # Master router and theme provider mapping context
│   │
│   ├── components/                    # Sharable UI Components
│   │   ├── ui/                        # Low-level layout atoms (buttons, inputs, dropdowns)
│   │   ├── Layout.tsx                 # Core application viewport shell shell layout
│   │   └── Guard.tsx                  # Client-side session isolation protector
│   │
│   ├── context/                       # Global state providers
│   │   ├── AuthContext.tsx            # Current session active user mappings
│   │   └── WorkspaceContext.tsx       # Target active Workspace scoping state engine
│   │
│   ├── screens/                       # Architectural Screen Components
│   │   ├── LoginScreen.tsx            # Screen 3.2: Account Authentication Gateway
│   │   ├── WorkspaceSelectScreen.tsx  # Screen 3.3: Tenant Workspace Selector
│   │   └── DashboardScreen.tsx        # Screen 3.1: Core Dashboard (Sprint 1 shell state)
│   │
│   ├── lib/                           # Vendor Clients & Utility Helpers
│   │   ├── supabase.ts                # Client-side Supabase connection builder
│   │   └── utils.ts                   # CSS merger utilities
│   │
│   └── types.ts                       # Shared TypeScript enums and system interfaces
```

---

## 2. Repository Structure & Configuration

Sprint 1 compiles through an Express backend acting as a development proxy, transitioning to bundled assets in production.

### Build and Launch Configuration (within `package.json`)
* **Dev**: Runs backend via `tsx server.ts` with live compilation.
* **Build**: Runs `vite build` to compile the React SPA target to `dist/`, then compiles TypeScript node backend to `dist/server.cjs` using `esbuild`.
* **Start**: Directly launches `node dist/server.cjs` mapping container ports environment.

---

## 3. Supabase Setup

Supabase binds authentication, policies, and base storage schemas:

1. **Authentication Config**: Enforce Sign-up confirmation, setup password strength thresholds, and map redirect callback loops matching safe OAuth patterns inside AI Studio frame properties.
2. **Metadata Claims Setup**: Configure database triggers to automatically append `tenant_id` claims into JWT payloads during authentication tokens construction.
3. **Storage Container**: Provision isolated private bucket schemes `folders/tenants/` mapping tenant IDs to support future invoice uploads.

---

## 4. Authentication Flow

```
[ User Inputs email & password ]
             │
             ▼
[ Supabase Auth validates credentials ]
             │
             ▼
[ JWT token issued with Custom Tenant Claims ]
             │
             ▼
[ AuthContext saves Token in secure HttpOnly cookies ]
             │
             ▼
[ Client sets Authorization Bearer Header ]
```

1. **Attempt Session**: Login screen queries credentials via `src/lib/supabase.ts`.
2. **Retrieve Auth Header**: Supabase verifies user state, returning access tokens specifying base account associations.
3. **Apply Context State**: `AuthContext.tsx` stores active roles, sets local system preferences, and initiates local redirection logic.

---

## 5. Tenant Flow

```
[ Load Tenant Profile API ]
             │
             ▼
[ Verify incoming JWT claims matching Target Organization ]
             │
             ▼
[ Query Tenant organization profile databases ]
             │
             ▼
[ Return tenant details / teammates lists to layout views ]
```

1. **Verify Organization Security**: API routes verify incoming keys. The gateway verifies that the requesting user's tenant ID claims line up with targeted path queries.
2. **Retrieve Active Settings**: Fetch core localization parameters (Default operating currency set strictly to **MYR**).
3. **Bind Account Workspace**: Determine team structures, permission ranks, and active subscription schemes before releasing data models.

---

## 6. Workspace Flow

```
[ Request Workspaces list ]
             │
             ▼
[ Enforce strict X-Workspace-Id state checks at API ]
             │
             ▼
[ Select target Workspace -> Store identifier locally ]
             │
             ▼
[ Clear preceding visual layouts -> Retrieve isolated registers ]
```

1. **Workspace Swapping**: User triggers selection in header dropdowns.
2. **Sync Client Header**: App update processes client headers, applying the fresh `X-Workspace-Id` parameter to all outgoing network fetch queries.
3. **Re-Initialize Context Panels**: Dashboards wipe residual cash tracking displays, pull updated ledger maps from the isolated workspace data pool, and reset live AI conversation windows.

---

## 7. Required Database Tables

These critical tables from Database Architecture V1.2 are constructed in Supabase PostgreSQL during Sprint 1:

```sql
-- Core Accounts
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) DEFAULT 'USER' NOT NULL, -- 'HQ', 'DEMO', 'USER'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Workspace Compartments
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_tenant_workspace_slug UNIQUE (tenant_id, slug)
);

-- Seed Ledger Structures initialized during fresh Workspace provisions
CREATE TABLE general_ledger_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
    is_system_default BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uniq_workspace_category_code UNIQUE (workspace_id, code)
);
```

---

## 8. Required APIs (Sprint 1 Interface Gates)

### A. Authentication & Session Nodes
* `POST /api/v1/auth/login`: Handles email/password authentication via Supabase Auth client interface wrapper.
* `POST /api/v1/auth/logout`: Erases local memory registers and expires session tokens.

### B. Tenant Account Nodes
* `GET /api/v1/tenant`: Fetches primary metadata profiling the organization (enforces default currency check: **MYR**).

### C. Workspace Routing Nodes
* `GET /api/v1/workspaces`: Fetches roster of isolated workspaces linked to user's authorized Tenant ID.
* `POST /api/v1/workspaces`: Provisions a new workspace compartment, triggering default ledger code templates mappings.

---

## 9. Required Screens (Sprint 1 Visual Maps)

1. **Authentication Gateway (`Screen 3.2`)**: Off-white layout containing user input widgets, state loading panels, and authorization validation messages.
2. **Tenant Workspace Selection Dashboard (`Screen 3.3`)**: Compact panel layout listing accessible company modules, including single-click workspace setups and quick-login redirect triggers.
3. **Core Shell Layout Template (`Screen 3.1 Scaffolding`)**: Master page container featuring the workspace drawer and global app navigation bars, providing isolated mount views for subsequent financial charts.

---

## 10. Development Task Backlog (Implementation Order)

### Task Group A: Environment Setup (Phase 1)
* **Task A.1**: Map folder routing structures and configure custom Google fonts ("Space Grotesk", "JetBrains Mono", and "Inter") inside global CSS layers.
* **Task A.2**: Update server hooks inside file `server.ts` to host standard Vite middlewares and service files properly on port `3000`.

### Task Group B: Authentication & Organization Segregates (Phase 2)
* **Task B.1**: Establish `AuthContext.tsx` bindings, writing login actions interfacing directly with Supabase Auth configurations.
* **Task B.2**: Build Screen 3.2 Login GUI and wire state models capturing user authentication.
* **Task B.3**: Write Node server validation middleware asserting incoming token claims and tenant checks inside `server.ts`.

### Task Group C: Workspace Segment Provisions (Phase 3)
* **Task C.1**: Build the list APIs and DB models allocating new workspaces.
* **Task C.2**: Compose Screen 3.3 Workspace Manager layout, prompting users with selector widgets during access flows.
* **Task C.3**: Instantiate `WorkspaceContext.tsx` containing default local storage headers checks to secure dynamic workspace swaps.
* **Task C.4**: Add routing guards validating workspace context constraints on core pages, redirecting unassigned user views to selection panels automatically.
