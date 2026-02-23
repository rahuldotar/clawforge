# ClawForge Control Plane — Setup & Features

The control plane (`@openclaw/clawforge-server`) is the central API that manages authentication, policies, skill reviews, audit logs, and the kill switch for all OpenClaw gateways in your organization.

**Stack:** Fastify 5 · Drizzle ORM · PostgreSQL · jose (OIDC) · Zod validation

---

## Table of Contents

- [Setup](#setup)
  - [Prerequisites](#prerequisites)
  - [Database](#database)
  - [Environment Variables](#environment-variables)
  - [Running](#running)
  - [Migrations](#migrations)
- [Features](#features)
  - [1. SSO / OIDC Authentication](#1-sso--oidc-authentication)
  - [2. Organization & User Management](#2-organization--user-management)
  - [3. Policy Management](#3-policy-management)
  - [4. Tool Enforcement](#4-tool-enforcement)
  - [5. Skill Governance](#5-skill-governance)
  - [6. Audit Logging](#6-audit-logging)
  - [7. Kill Switch](#7-kill-switch)
  - [8. Client Heartbeat](#8-client-heartbeat)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Security Considerations](#security-considerations)
- [Production Deployment](#production-deployment)

---

## Setup

### Prerequisites

| Dependency | Version |
|---|---|
| Node.js | ≥ 22 |
| PostgreSQL | ≥ 15 |
| pnpm | ≥ 9 |

### Database

```bash
# Create the database
createdb clawforge

# Or via psql
psql -c "CREATE DATABASE clawforge;"
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://localhost:5432/clawforge` | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | `clawforge-dev-secret-change-in-production` | Secret for signing JWTs. **Must change in production.** |
| `PORT` | No | `4100` | HTTP listen port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `CORS_ORIGIN` | No | `*` (all origins) | Comma-separated allowed origins (e.g. `http://localhost:4200,https://admin.example.com`) |

Create a `.env` file:

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/clawforge"
JWT_SECRET="generate-a-strong-random-secret-here"
CORS_ORIGIN="http://localhost:4200"
```

### Running

```bash
cd packages/clawforge-server

# Development (auto-reload)
pnpm dev

# Production
pnpm build
pnpm start
```

Verify it's running:

```bash
curl http://localhost:4100/health
# → {"status":"ok"}
```

### Migrations

Migrations are managed by Drizzle Kit. Config is in `drizzle.config.ts`.

```bash
cd packages/clawforge-server

# Generate a migration after schema changes
pnpm db:generate

# Apply pending migrations
pnpm db:migrate

# Open Drizzle Studio (visual DB browser)
pnpm db:studio
```

The initial schema is created automatically by Drizzle on first connection. The `0001_audit_partitioning.sql` migration converts `audit_events` to a partitioned table (by month) for production-scale deployments — run it during a maintenance window.

---

## Features

### 1. SSO / OIDC Authentication

The control plane acts as a **token broker** between your Identity Provider (IdP) and OpenClaw gateways. It does not store passwords — it validates tokens from your existing IdP.

**Supported IdPs:** Any OIDC-compliant provider — Okta, Auth0, Microsoft Entra ID (Azure AD), Google Workspace, Keycloak, etc.

#### How It Works

```
User runs /clawforge-login in OpenClaw
    │
    ▼
Plugin starts local callback server (:19832)
    │
    ▼
Opens browser → IdP authorization URL (PKCE)
    │
    ▼
User authenticates with IdP
    │
    ▼
IdP redirects to localhost:19832/clawforge/callback
    │
    ▼
Plugin sends code + PKCE verifier to control plane
    │
    ▼
Control plane exchanges code at IdP token endpoint
    │
    ▼
Control plane verifies id_token against IdP JWKS
    │
    ▼
Upserts user record, issues ClawForge JWTs
    │
    ▼
Plugin stores session locally (~/.clawforge/session.json)
```

#### Three Grant Types

| Grant | Use Case | Required Fields |
|---|---|---|
| `authorization_code` | Interactive browser login (PKCE) | `code`, `codeVerifier`, `redirectUri` + `X-ClawForge-Org` header |
| `id_token` | Direct token validation (headless/CI) | `idToken`, `orgId` |
| `refresh_token` | Renew expired session | `refreshToken` |

#### Token Lifetimes

| Token | Lifetime |
|---|---|
| Access token | 1 hour |
| Refresh token | 30 days |

#### IdP Configuration

The control plane discovers your IdP's endpoints automatically via `/.well-known/openid-configuration`. You only need to provide:

1. **Issuer URL** — e.g. `https://your-org.okta.com`, `https://login.microsoftonline.com/{tenant}/v2.0`
2. **Client ID** — from your IdP's application registration
3. **Audience** (optional) — if your IdP uses a custom audience claim

These are stored in the `organizations.sso_config` column.

#### OIDC Discovery & JWKS Caching

Both the discovery document and JWKS are cached in-memory for 1 hour, reducing latency and IdP load for repeated token verifications.

#### Auto Role Assignment

- **First user** to authenticate in an org → automatically assigned `admin` role
- **Subsequent users** → assigned `user` role
- Admins can change roles via the admin console (planned)

---

### 2. Organization & User Management

#### Organizations

Organizations are the top-level tenant. Each org has:

- A unique UUID
- A name
- SSO configuration (issuer URL, client ID, optional audience)

Currently, orgs must be created directly in the database:

```sql
INSERT INTO organizations (name, sso_config)
VALUES (
  'Acme Corp',
  '{"issuerUrl": "https://acme.okta.com", "clientId": "0oa1234567890", "audience": "api://clawforge"}'
);
```

#### Users

Users are auto-created on first SSO login. The `users` table tracks:

| Field | Description |
|---|---|
| `email` | From OIDC `email` claim |
| `name` | From OIDC `name` claim |
| `role` | `admin` or `user` |
| `lastSeenAt` | Updated on each token exchange/refresh |

Users are scoped to an org via a unique `(orgId, email)` index.

**API:**

```
GET /api/v1/users/:orgId       # Admin only — list all org users
```

---

### 3. Policy Management

Policies define what OpenClaw gateways are allowed to do. Each org has **one active policy** that is versioned — every update bumps the version number, allowing clients to detect stale policies.

#### Policy Structure

```json
{
  "version": 3,
  "tools": {
    "allow": ["read", "write", "web_search", "web_fetch"],
    "deny": ["exec", "gateway"],
    "profile": "restricted"
  },
  "skills": {
    "requireApproval": true,
    "approved": [
      { "name": "weather", "key": "weather-v1", "scope": "org" },
      { "name": "custom-tool", "key": "custom-v2", "scope": "self" }
    ]
  },
  "killSwitch": {
    "active": false,
    "message": null
  },
  "auditLevel": "metadata"
}
```

#### Tool Configuration

| Field | Type | Description |
|---|---|---|
| `allow` | `string[]` | Whitelist — only these tools are permitted (if set) |
| `deny` | `string[]` | Blacklist — these tools are always blocked |
| `profile` | `string` | Named enforcement profile (for custom logic) |

**Evaluation order:** deny list checked first → allow list checked second → default allow if neither list is set.

#### Effective Policy

The `/effective` endpoint merges the org policy with user-specific skill approvals:

- Org-scoped skills → visible to all users
- Self-scoped skills → visible only to the approved user

**API:**

```
GET /api/v1/policies/:orgId/effective   # Any authenticated user
GET /api/v1/policies/:orgId             # Admin only — raw policy
PUT /api/v1/policies/:orgId             # Admin only — update policy
PUT /api/v1/policies/:orgId/kill-switch # Admin only — toggle kill switch
```

#### Policy Update Example

```bash
curl -X PUT http://localhost:4100/api/v1/policies/$ORG_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "toolsConfig": {
      "allow": ["read", "write", "web_search"],
      "deny": ["exec", "gateway"]
    },
    "auditLevel": "full"
  }'
```

Each update increments the policy `version`. Connected gateways detect the new version on their next heartbeat and refresh their cached policy.

---

### 4. Tool Enforcement

Tool enforcement happens **client-side** in the OpenClaw plugin, not on the control plane. The control plane's role is to serve the policy; the plugin enforces it.

The enforcement flow:

```
Tool call → before_tool_call hook
    │
    ├── Kill switch active?
    │   └── YES → Block all tools, audit "kill_switch_activated"
    │
    ├── Tool in deny list?
    │   └── YES → Block, audit "tool_call_attempt" (blocked)
    │
    ├── Allow list defined & tool NOT in it?
    │   └── YES → Block, audit "tool_call_attempt" (blocked)
    │
    └── ALLOW → Audit "tool_call_attempt" (allowed), proceed
                    │
                    ▼
              Tool executes
                    │
                    ▼
              after_tool_call → Audit "tool_call_result"
```

---

### 5. Skill Governance

Skills are third-party extensions that can execute code, read files, or call APIs. The skill governance system ensures only reviewed and approved skills run in your org.

#### Submission Flow

```
Developer runs /clawforge-submit <skill-name>
    │
    ▼
Plugin bundles the skill (SKILL.md, scripts, assets)
    │
    ▼
Automated security scan runs locally
  - Counts files scanned
  - Flags critical / warn / info findings
  - Records evidence (file, line, rule, message)
    │
    ▼
Bundle + scan results submitted to control plane
    │
    ▼
Submission enters "pending" review queue
    │
    ▼
Admin reviews in admin console
    │
    ├── Approve (org-wide) → All users can use the skill
    ├── Approve (self) → Only the submitting user can use it
    └── Reject → Skill not loaded, notes sent back
```

#### Approval Scopes

| Scope | Effect |
|---|---|
| `org` | Skill is available to all users in the organization |
| `self` | Skill is available only to the specific user (or a designated user) |

#### Submission Record

Each submission stores:

- Skill name and key
- Manifest content (SKILL.md)
- Arbitrary metadata
- Full security scan results (findings with rule ID, severity, file, line, evidence)
- Review status, reviewer, and notes

**API:**

```
POST /api/v1/skills/:orgId/submit         # Submit skill for review
GET  /api/v1/skills/:orgId/review          # Admin — list pending
PUT  /api/v1/skills/:orgId/review/:id      # Admin — approve/reject
GET  /api/v1/skills/:orgId/approved        # List approved skills
```

#### Review Example

```bash
# Approve a skill org-wide
curl -X PUT http://localhost:4100/api/v1/skills/$ORG_ID/review/$SUBMISSION_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved-org",
    "reviewNotes": "Reviewed scan results, no critical issues."
  }'

# Approve for a specific user only
curl -X PUT http://localhost:4100/api/v1/skills/$ORG_ID/review/$SUBMISSION_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved-self",
    "approvedForUser": "user-uuid-here",
    "reviewNotes": "Approved for personal use only."
  }'

# Reject
curl -X PUT http://localhost:4100/api/v1/skills/$ORG_ID/review/$SUBMISSION_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "rejected",
    "reviewNotes": "Critical findings in scan: uses exec to run arbitrary shell commands."
  }'
```

---

### 6. Audit Logging

Every tool call, session event, and (at `full` level) LLM interaction is logged. Events are batched on the client side and flushed to the control plane periodically.

#### Audit Levels

| Level | What's Logged |
|---|---|
| `full` | Tool calls + session lifecycle + LLM input/output (provider, model, usage stats) |
| `metadata` | Tool calls + session lifecycle (no LLM content) |
| `off` | Nothing sent to control plane |

#### Event Types

| Event | Trigger |
|---|---|
| `tool_call_attempt` | Before a tool call (includes allowed/blocked outcome) |
| `tool_call_result` | After a tool call completes (includes duration, error if any) |
| `session_start` | New session created |
| `session_end` | Session ended (includes message count, duration) |
| `llm_input` | LLM request sent (full level only — provider, model, image count) |
| `llm_output` | LLM response received (full level only — provider, model, token usage) |
| `kill_switch_activated` | Kill switch blocked a tool call |
| `policy_refresh` | Policy was refreshed from control plane |

#### Client-Side Batching

The plugin buffers events and flushes them in configurable batches:

| Config | Description |
|---|---|
| `auditBatchSize` | Max events per flush (default varies) |
| `auditFlushIntervalMs` | Flush interval in milliseconds |

On gateway shutdown, the buffer is flushed before exit.

#### Querying Audit Logs

```bash
# All events for an org
curl "http://localhost:4100/api/v1/audit/$ORG_ID/query" \
  -H "Authorization: Bearer $TOKEN"

# Filter by user, type, time range
curl "http://localhost:4100/api/v1/audit/$ORG_ID/query?\
userId=$USER_ID&\
eventType=tool_call_attempt&\
outcome=blocked&\
from=2025-01-01T00:00:00Z&\
to=2025-01-31T23:59:59Z&\
limit=50&\
offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**

```json
{
  "events": [
    {
      "id": "uuid",
      "userId": "uuid",
      "eventType": "tool_call_attempt",
      "toolName": "exec",
      "outcome": "blocked",
      "agentId": "main",
      "sessionKey": "session-abc",
      "metadata": {},
      "timestamp": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

#### Audit Table Partitioning

For production deployments with high event volume, run the `0001_audit_partitioning.sql` migration. This converts `audit_events` to a **monthly range-partitioned table** on the `timestamp` column:

- Creates partitions for 3 months back through 6 months forward
- Includes a default partition for out-of-range data
- Indexes are created per-partition automatically

**Run during a maintenance window** — the migration renames, recreates, and copies data.

To create new monthly partitions going forward:

```sql
CREATE TABLE audit_events_2025_07
  PARTITION OF audit_events
  FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
```

---

### 7. Kill Switch

The kill switch is an emergency remote disable that instantly blocks **all** tool calls across every connected gateway in the org.

#### Activating

```bash
# Activate
curl -X PUT http://localhost:4100/api/v1/policies/$ORG_ID/kill-switch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"active": true, "message": "All AI tool access suspended pending security review."}'

# Deactivate
curl -X PUT http://localhost:4100/api/v1/policies/$ORG_ID/kill-switch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"active": false}'
```

#### Propagation

Kill switch state propagates via the **heartbeat** mechanism:

1. Each gateway polls `GET /api/v1/heartbeat/:orgId/:userId` on a configurable interval
2. Response includes `killSwitch: true/false` and optional `killSwitchMessage`
3. If active, the plugin's tool enforcer blocks all `before_tool_call` events
4. The custom message is displayed to users attempting to use tools

**Propagation delay** = up to `heartbeatIntervalMs` (default ~60s). Not instant.

#### Failure Threshold

If the control plane becomes unreachable, the plugin tracks consecutive heartbeat failures. After `heartbeatFailureThreshold` consecutive failures, it **activates the local kill switch** as a safety measure — tools are blocked until the control plane is reachable again and confirms the kill switch is off.

---

### 8. Client Heartbeat

The heartbeat serves dual purposes:

1. **Liveness tracking** — records the last heartbeat time per user, visible in the admin console
2. **State synchronization** — returns current kill switch status and policy version

```
GET /api/v1/heartbeat/:orgId/:userId
```

**Response:**

```json
{
  "policyVersion": 3,
  "killSwitch": false,
  "killSwitchMessage": null,
  "refreshPolicyNow": false
}
```

The `refreshPolicyNow` field (currently always `false`) is reserved for future use — it could trigger an immediate policy refresh when the server detects a version mismatch.

---

## Database Schema

### Entity Relationship

```
organizations (1) ──┬── (N) users
                    ├── (1) policies
                    ├── (N) skill_submissions
                    ├── (N) approved_skills
                    ├── (N) audit_events
                    └── (N) client_heartbeats
```

### Tables

#### `organizations`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `name` | TEXT | Org display name |
| `sso_config` | JSONB | `{issuerUrl, clientId, audience?}` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

#### `users`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `org_id` | UUID (FK → organizations) | |
| `email` | TEXT | Unique per org |
| `name` | TEXT | From OIDC claims |
| `role` | TEXT | `admin` or `user` |
| `last_seen_at` | TIMESTAMPTZ | Updated on auth |
| `created_at` | TIMESTAMPTZ | |

Unique index: `(org_id, email)`

#### `policies`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `org_id` | UUID (FK, unique) | One policy per org |
| `version` | INT | Incremented on each update |
| `tools_config` | JSONB | `{allow?, deny?, profile?}` |
| `skills_config` | JSONB | `{requireApproval, approved[]}` |
| `kill_switch` | BOOLEAN | |
| `kill_switch_message` | TEXT | Shown to users when active |
| `audit_level` | TEXT | `full`, `metadata`, or `off` |
| `updated_at` | TIMESTAMPTZ | |

#### `skill_submissions`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `org_id` | UUID (FK) | |
| `submitted_by` | UUID (FK → users) | |
| `skill_name` | TEXT | |
| `skill_key` | TEXT | Optional unique key |
| `metadata` | JSONB | Arbitrary key-value data |
| `manifest_content` | TEXT | Full SKILL.md content |
| `scan_results` | JSONB | `{scannedFiles, critical, warn, info, findings[]}` |
| `status` | TEXT | `pending`, `approved-org`, `approved-self`, `rejected` |
| `reviewed_by` | UUID (FK → users) | |
| `review_notes` | TEXT | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

Index: `(org_id, status)`

#### `approved_skills`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `org_id` | UUID (FK) | |
| `skill_name` | TEXT | |
| `skill_key` | TEXT | |
| `scope` | TEXT | `org` or `self` |
| `approved_for_user` | UUID (FK → users) | Set for `self` scope |
| `created_at` | TIMESTAMPTZ | |

Index: `(org_id)`

#### `audit_events`

| Column | Type | Description |
|---|---|---|
| `id` | UUID | |
| `org_id` | UUID (FK) | |
| `user_id` | UUID | |
| `event_type` | TEXT | See event types above |
| `tool_name` | TEXT | For tool-related events |
| `outcome` | TEXT | `allowed`, `blocked`, `error`, `success` |
| `agent_id` | TEXT | |
| `session_key` | TEXT | |
| `metadata` | JSONB | |
| `timestamp` | TIMESTAMPTZ | Event time |

Indexes: `(org_id, timestamp)`, `(org_id, user_id)`
Partitioned by range on `timestamp` (after migration 0001).

#### `client_heartbeats`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `org_id` | UUID (FK) | |
| `user_id` | UUID (FK → users) | |
| `last_heartbeat_at` | TIMESTAMPTZ | |
| `client_version` | TEXT | |

Unique index: `(org_id, user_id)` — upserted on each heartbeat.

---

## API Reference

### Health Check

```
GET /health → {"status": "ok"}
```

No authentication required.

### Authentication

| Method | Path | Auth | Body |
|---|---|---|---|
| `POST` | `/api/v1/auth/exchange` | None | See grant types below |

**Authorization Code:**
```json
{
  "grantType": "authorization_code",
  "code": "auth-code-from-idp",
  "codeVerifier": "pkce-verifier",
  "redirectUri": "http://localhost:19832/clawforge/callback"
}
```
Header: `X-ClawForge-Org: <org-uuid>`

**ID Token (headless):**
```json
{
  "grantType": "id_token",
  "idToken": "eyJ...",
  "orgId": "org-uuid"
}
```

**Refresh:**
```json
{
  "grantType": "refresh_token",
  "refreshToken": "eyJ..."
}
```

**Response (all grant types):**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresAt": 1703361600000,
  "userId": "uuid",
  "orgId": "uuid",
  "email": "user@example.com",
  "roles": ["admin"]
}
```

### Policies

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/policies/:orgId/effective` | User | Effective policy (merged with user skills) |
| `GET` | `/api/v1/policies/:orgId` | Admin | Raw org policy |
| `PUT` | `/api/v1/policies/:orgId` | Admin | Update policy (bumps version) |
| `PUT` | `/api/v1/policies/:orgId/kill-switch` | Admin | Toggle kill switch |

### Skills

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/skills/:orgId/submit` | User | Submit skill + scan results |
| `GET` | `/api/v1/skills/:orgId/review` | Admin | List pending submissions |
| `PUT` | `/api/v1/skills/:orgId/review/:id` | Admin | Approve/reject with notes |
| `GET` | `/api/v1/skills/:orgId/approved` | User | List approved skills |

### Audit

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/audit/:orgId/events` | User | Ingest event batch |
| `GET` | `/api/v1/audit/:orgId/query` | Admin | Query with filters |

Query params: `userId`, `eventType`, `toolName`, `outcome`, `from` (ISO), `to` (ISO), `limit`, `offset`

### Heartbeat

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/heartbeat/:orgId/:userId` | User | Heartbeat + kill switch status |

### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/users/:orgId` | Admin | List org users |

---

## Security Considerations

### JWT Secret

The `JWT_SECRET` environment variable signs all access and refresh tokens. In production:

- Use a cryptographically random string (≥ 32 bytes)
- Rotate periodically and re-issue tokens
- Never use the default dev secret

### CORS

Set `CORS_ORIGIN` to your admin console domain(s) only. Don't leave it as `*` in production.

### Database

- Use SSL connections (`?sslmode=require` in connection string)
- Restrict database user permissions to only the `clawforge` database
- Enable connection pooling for production (PgBouncer or built-in)

### Token Storage

Client sessions are stored at `~/.clawforge/session.json`. Ensure appropriate file permissions (`600`) on multi-user systems.

### Network

- Run the control plane behind a reverse proxy (nginx/Caddy) with TLS
- The plugin communicates with the control plane over HTTP — use HTTPS in production
- Heartbeat and audit endpoints accept data from authenticated clients only

---

## Production Deployment

### Recommended Architecture

```
                    Internet
                       │
                    TLS (443)
                       │
                ┌──────┴──────┐
                │  Reverse     │
                │  Proxy       │
                │  (Caddy/     │
                │   nginx)     │
                └──────┬──────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
     :4100/api    :4200/admin   (static)
          │            │
  ┌───────┴───┐  ┌─────┴─────┐
  │ clawforge │  │ clawforge │
  │  -server  │  │  -admin   │
  └─────┬─────┘  └───────────┘
        │
   PostgreSQL
```

### Checklist

- [ ] Set a strong `JWT_SECRET`
- [ ] Configure `CORS_ORIGIN` to admin domain only
- [ ] Use PostgreSQL with SSL
- [ ] Run audit partitioning migration (`0001_audit_partitioning.sql`)
- [ ] Set up partition creation cron (monthly)
- [ ] Put control plane behind TLS reverse proxy
- [ ] Create org record in database with SSO config
- [ ] Configure OpenClaw plugin with `controlPlaneUrl` and SSO settings
- [ ] Test `/clawforge-login` flow end to end
- [ ] Set appropriate `heartbeatIntervalMs` and `heartbeatFailureThreshold`
- [ ] Monitor `/health` endpoint
