# SV1-03: minimum Beta abuse controls

Auth server actions consume an atomic PostgreSQL budget before contacting Supabase Auth. The account key is normalized and HMAC-SHA256 protected; neither email nor IP is persisted. The server uses SECURITY_RATE_LIMIT_SECRET if configured, otherwise the existing server-only service key as the HMAC key. Changing this key resets effective budgets. Database outages fail closed.

| Flow | IP budget | Account budget | Window |
| --- | --- | --- | --- |
| Login | 60 | 10 | 15 minutes |
| Signup | 10 | 3 | 1 hour |
| Recovery | 10 | 3 | 1 hour |
| Callback exchange | 60 | — | 15 minutes |

Only Vercel's platform-controlled x-vercel-forwarded-for header is trusted on Vercel. Other hosts use a shared conservative bucket until a trusted ingress adapter is configured. Header injection does not select a different account quota. Configure limits in lib/security/auth-rate-limit.ts. Account limits deliberately trade repeated login attempts for a cooldown; distributed account lockout remains an operational risk to monitor.

Supabase's public Auth endpoint can be called without Next.js: its provider rate limits, MFA challenge limits, email cooldowns and generic email confirmation behavior remain required. Application budgets supplement these; they cannot replace provider CAPTCHA/bot protection for direct Auth calls. No dashboard hardening is claimed by this change.

Publication triggers enforce 50 new records and 20 first publications per owner/resource in a rolling 24 hours. Locations, Opportunities (including Jobs), Services and the backing Projects use separate budgets. A private configuration table allows operators to tune these defaults with reviewed SQL. Owners cannot change limits or events.

Triggers run AFTER writes, including invoker RPC UPSERTs and direct PostgREST. Locks serialize requests per owner; limits use server timestamps. Editing/retrying the same entity does not consume again. Deletion does not refund quota. Republishing the same entity is deduplicated for seven days; it does not create more catalog entries. Events expire after seven days; Auth buckets after two days, with bounded cleanup. Existing entities are not backfilled or removed.

The Jobs/Services inbox remains unchanged: a shared 10 inquiries/24h limit, advisory lock per sender and one inquiry per sender/publication. No new direct write grant is introduced.

Deploy the versioned migration before enabling the application build. Production application/migration deployment is outside this task.
