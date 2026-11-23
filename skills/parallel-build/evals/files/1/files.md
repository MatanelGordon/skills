# Multi-tenant support: files and who needs them

Goal: add multi-tenant support to the API: tenant-scoped auth, per-tenant rate
limiting, tenant-aware database queries and an admin UI for managing tenants.

## Files to change

| Path | Change | Needed by |
|---|---|---|
| `src/types/tenant.ts` | new: `Tenant`, `TenantId` | auth, rate limiting, queries, admin UI |
| `src/config/tenants.ts` | new: tenant config loader | auth, rate limiting |
| `migrations/0007_tenants.sql` | new: `tenants` table, `tenant_id` columns | queries, admin UI |
| `src/routes/index.ts` | register the new routes | auth, rate limiting, admin UI |
| `package.json` | add `rate-limiter-flexible` | rate limiting |
| `src/auth/tenant-auth.ts`, `src/auth/middleware.ts` | tenant-scoped auth | auth |
| `src/ratelimit/**` | new: per-tenant limiter | rate limiting |
| `src/db/queries/**` | add a tenant filter to every query | queries |
| `web/admin/tenants/**` | new: admin UI | admin UI |

## Critical-path tests

```bash
npm test
```
