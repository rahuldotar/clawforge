# ClawForge — Enterprise Governance for OpenClaw

ClawForge adds enterprise admin capabilities to OpenClaw: SSO authentication, org-level policy enforcement, tool & skill allowlisting, audit trails, and a remote kill switch — all managed through a web admin console.

## Architecture

```
┌─────────────────────┐       ┌──────────────────────┐       ┌─────────────────────┐
│   OpenClaw Gateway   │       │   Control Plane API   │       │    Admin Console     │
│                     │  HTTP  │                      │  HTTP  │                     │
│  @openclaw/clawforge│◄─────►│  @openclaw/clawforge  │◄─────►│  @openclaw/clawforge │
│     (extension)     │       │       -server         │       │       -admin         │
└─────────────────────┘       └──────────┬───────────┘       └─────────────────────┘
                                         │
                                    PostgreSQL
```

**Three packages:**

| Package | Path | Description |
|---|---|---|
| `@openclaw/clawforge` | `extensions/clawforge/` | OpenClaw plugin — hooks into the gateway lifecycle |
| `@openclaw/clawforge-server` | `packages/clawforge-server/` | Fastify control plane API (port 4100) |
| `@openclaw/clawforge-admin` | `packages/clawforge-admin/` | Next.js admin UI (port 4200) |

## Features

### ✅ SSO / OIDC Authentication
- Authorization Code flow with PKCE
- Token exchange, refresh, and session management
- First user in an org auto-promoted to admin
- `/clawforge-login` command in OpenClaw

### ✅ Org Policy Management
- Tool allow/deny lists and enforcement profiles
- Skill approval workflows (org-wide or per-user scope)
- Audit level configuration (full / metadata / off)
- Versioned policies with optimistic caching

### ✅ Tool Enforcement
- `before_tool_call` hook blocks disallowed tools
- Allow/deny list matching with profile-based overrides
- Blocked calls logged to audit trail

### ✅ Skill Governance
- `/clawforge-submit` command packages and submits skills
- Automated security scanning (file count, critical/warn/info findings)
- Admin review workflow: approve (org/self scope) or reject with notes
- Only approved skills loaded into the gateway

### ✅ Audit Logging
- Batched async event ingestion to control plane
- Configurable levels: `full` (includes LLM I/O), `metadata`, `off`
- Events: tool calls, session lifecycle, LLM input/output, policy changes
- Queryable by user, event type, tool, outcome, time range

### ✅ Kill Switch
- Instant remote disable of all tool calls
- Heartbeat polling with configurable interval and failure threshold
- Custom message displayed to users when active
- Admin toggle in web console

### ✅ `/clawforge-status` Command
- Shows auth state, org, policy version, kill switch status, audit level

## Quick Start

### Prerequisites

- Node.js ≥ 22
- PostgreSQL ≥ 15
- pnpm
- An OIDC provider (Okta, Auth0, Entra ID, etc.)

### 1. Database Setup

```bash
# Create the database
createdb clawforge

# Run migrations
cd packages/clawforge-server
pnpm db:migrate
```

### 2. Start the Control Plane

```bash
cd packages/clawforge-server

# Required env vars
export DATABASE_URL="postgresql://localhost:5432/clawforge"
export JWT_SECRET="your-secret-here"  # Change in production!
export CORS_ORIGIN="http://localhost:4200"

# Development
pnpm dev

# Production
pnpm build && pnpm start
```

The API starts on `http://localhost:4100`. Health check: `GET /health`.

### 3. Start the Admin Console

```bash
cd packages/clawforge-admin

# Point to the control plane
export NEXT_PUBLIC_API_URL="http://localhost:4100"

# Development
pnpm dev

# Production
pnpm build && pnpm start
```

The admin UI is available at `http://localhost:4200`.

### 4. Configure the OpenClaw Extension

Add ClawForge to your OpenClaw config (`openclaw.json`):

```json
{
  "plugins": {
    "clawforge": {
      "controlPlaneUrl": "http://localhost:4100",
      "orgId": "your-org-uuid",
      "sso": {
        "issuerUrl": "https://your-idp.example.com",
        "clientId": "your-oidc-client-id"
      },
      "policyCacheTtlMs": 300000,
      "heartbeatIntervalMs": 60000,
      "heartbeatFailureThreshold": 3,
      "auditBatchSize": 50,
      "auditFlushIntervalMs": 10000
    }
  }
}
```

### 5. Authenticate

From your OpenClaw session, run:

```
/clawforge-login
```

This opens a browser for OIDC login. After authentication, the gateway fetches your org policy and starts enforcing it.

## Configuration Reference

### Plugin Config (`ClawForgePluginConfig`)

| Key | Type | Default | Description |
|---|---|---|---|
| `controlPlaneUrl` | `string` | — | URL of the ClawForge control plane API |
| `orgId` | `string` | — | Organization UUID (fallback if not in session) |
| `sso.issuerUrl` | `string` | — | OIDC issuer URL |
| `sso.clientId` | `string` | — | OIDC client ID |
| `policyCacheTtlMs` | `number` | — | How long to cache policy locally (ms) |
| `heartbeatIntervalMs` | `number` | — | Kill switch polling interval (ms) |
| `heartbeatFailureThreshold` | `number` | — | Consecutive heartbeat failures before activating local kill switch |
| `auditBatchSize` | `number` | — | Max events per audit flush batch |
| `auditFlushIntervalMs` | `number` | — | Audit event flush interval (ms) |

### Server Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4100` | HTTP listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_URL` | `postgresql://localhost:5432/clawforge` | PostgreSQL connection string |
| `JWT_SECRET` | `clawforge-dev-secret-change-in-production` | JWT signing secret |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |

### Admin Console Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4100` | Control plane API URL |

## API Reference

All endpoints (except `/health` and `/api/v1/auth/exchange`) require a `Bearer` token in the `Authorization` header.

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/exchange` | Public | Exchange OIDC code/token for ClawForge session |

**Grant types:**
- `authorization_code` — Code + PKCE verifier (requires `X-ClawForge-Org` header)
- `id_token` — Direct id_token validation (requires `orgId` in body)
- `refresh_token` — Refresh an expired session

### Policies

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/policies/:orgId/effective` | User | Get effective policy for authenticated user |
| `GET` | `/api/v1/policies/:orgId` | Admin | Get raw org policy |
| `PUT` | `/api/v1/policies/:orgId` | Admin | Update org policy |
| `PUT` | `/api/v1/policies/:orgId/kill-switch` | Admin | Toggle kill switch |

**Update policy body:**
```json
{
  "toolsConfig": {
    "allow": ["web_search", "read", "write"],
    "deny": ["exec"],
    "profile": "restricted"
  },
  "skillsConfig": {
    "requireApproval": true,
    "approved": [
      { "name": "weather", "key": "weather-v1", "scope": "org" }
    ]
  },
  "auditLevel": "full"
}
```

**Kill switch body:**
```json
{
  "active": true,
  "message": "Tool access suspended pending security review."
}
```

### Skills

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/skills/:orgId/submit` | User | Submit a skill for review |
| `GET` | `/api/v1/skills/:orgId/review` | Admin | List pending submissions |
| `PUT` | `/api/v1/skills/:orgId/review/:id` | Admin | Approve or reject a submission |
| `GET` | `/api/v1/skills/:orgId/approved` | User | List approved skills |

**Review body:**
```json
{
  "status": "approved-org",
  "reviewNotes": "Reviewed, no issues found.",
  "approvedForUser": "optional-user-uuid"
}
```

Status values: `approved-org`, `approved-self`, `rejected`

### Audit

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/audit/:orgId/events` | User | Ingest audit events (batched from plugin) |
| `GET` | `/api/v1/audit/:orgId/query` | Admin | Query audit logs |

**Query parameters:** `userId`, `eventType`, `toolName`, `outcome`, `from`, `to`, `limit`, `offset`

### Heartbeat

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/heartbeat/:orgId/:userId` | User | Client heartbeat — returns kill switch state + policy version |

### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/users/:orgId` | Admin | List org users |

## Database Schema

7 tables managed by Drizzle ORM:

| Table | Purpose |
|---|---|
| `organizations` | Org registry with SSO config (issuer, client ID, audience) |
| `users` | Org members with role (`admin` / `user`) |
| `policies` | Versioned org policies (tools, skills, audit level, kill switch) |
| `skill_submissions` | Skill review queue with security scan results |
| `approved_skills` | Approved skills per org, with optional per-user scope |
| `audit_events` | Tool calls, session lifecycle, LLM I/O events |
| `client_heartbeats` | Last heartbeat timestamp per user per org |

## How It Works

### Startup Flow

1. Gateway loads the ClawForge extension
2. Extension checks for a saved session (`~/.clawforge/session.json`)
3. If expired → refresh via control plane; if missing → unauthenticated mode
4. Fetches org policy (cache → API → stale cache fallback)
5. Applies skill filter to OpenClaw config
6. Registers `before_tool_call` / `after_tool_call` / session / LLM hooks
7. Starts heartbeat polling for kill switch
8. On `gateway_stop` → flushes audit buffer, stops heartbeat

### Policy Enforcement

```
User invokes tool
    │
    ▼
before_tool_call hook fires
    │
    ├── Kill switch active? → BLOCK + audit "kill_switch_activated"
    │
    ├── Tool in deny list? → BLOCK + audit "tool_call_attempt" (blocked)
    │
    ├── Allow list exists & tool not in it? → BLOCK
    │
    └── ALLOW → audit "tool_call_attempt" (allowed)
         │
         ▼
    Tool executes
         │
         ▼
    after_tool_call hook → audit "tool_call_result"
```

### Policy Caching

```
On startup:
  1. Check local cache (within TTL) → use it, refresh in background
  2. Cache miss/expired → fetch from API, save to cache
  3. API unreachable → use stale cache as fallback

On heartbeat:
  - If server indicates new policy version → refresh immediately
```

## Development

```bash
# Install dependencies (from repo root)
pnpm install

# Run everything in dev mode
pnpm --filter @openclaw/clawforge-server dev   # API on :4100
pnpm --filter @openclaw/clawforge-admin dev    # UI on :4200

# Database management
cd packages/clawforge-server
pnpm db:generate   # Generate migration from schema changes
pnpm db:migrate    # Apply migrations
pnpm db:studio     # Open Drizzle Studio (visual DB browser)
```

## Known Gaps

- **No tests** — unit and integration tests needed for all three packages
- **No user CRUD** — users are auto-created on SSO login; no invite/remove/role-change API
- **No secret/key management** — no vault integration for API keys or credentials
- **No audit export** — no CSV/JSON export or retention policy management
- **No real-time push** — kill switch propagates on next heartbeat, not instantly
- **No multi-org management UI** — schema supports it, but no org creation flow
- **No Docker/deployment configs** — needs Dockerfile and docker-compose for production

## License

MIT
