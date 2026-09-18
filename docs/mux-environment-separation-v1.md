# Mux Environment Separation V1

## Scope

This change adds fail-closed application guards for Mux Preview and Production. It does not create or modify a Mux Production environment, credentials, signing keys, assets, playback IDs, webhooks, Vercel variables, or Billing behavior.

## Runtime contract

Every operation that reads or mutates protected Mux state uses a validated server client. The validation sequence is:

1. Read the server-only expected environment ID and type.
2. Reject a `development` expectation when `VERCEL_ENV=production`.
3. Reject a `production` expectation when `VERCEL_ENV` is anything other than `production`.
4. Call Mux `whoami` using the configured access token.
5. Require an exact match for environment ID and environment type.
6. Require both `video:read` and `video:write` permissions.
7. Continue with the requested Mux operation only after all checks pass.

Successful validation is cached per server process and per exact configuration snapshot: expected ID, expected type, access-token pair, Vercel environment, and required permission set. Concurrent callers share the same validation promise. A failure is not cached. A change to any snapshot field forces a new `whoami` call, so a result validated for Preview cannot be reused for Production.

Webhook verification has its own strict order: verify the Mux signature, require `event.environment.id` to match the configured expected ID, validate the access token through `whoami`, then retrieve or synchronize Mux objects. The existing supported event list and synchronization behavior remain unchanged.

The raw client constructor remains available only where the webhook SDK must verify the request signature before trusting event data. No Mux API read or mutation occurs through that unvalidated path.

## Required server variables

Each Vercel scope must contain a complete, internally coherent set. None of these values belongs in client-side variables.

| Variable | Preview | Production |
| --- | --- | --- |
| `MUX_EXPECTED_ENVIRONMENT_ID` | Exact Mux development environment ID | Exact Mux production environment ID |
| `MUX_EXPECTED_ENVIRONMENT_TYPE` | `development` | `production` |
| `MUX_TOKEN_ID` | Token issued by the Preview environment | Token issued by the Production environment |
| `MUX_TOKEN_SECRET` | Matching Preview token secret | Matching Production token secret |
| `MUX_SIGNING_KEY` | Preview signing-key ID | Production signing-key ID |
| `MUX_PRIVATE_KEY` | Matching Preview private key | Matching Production private key |
| `MUX_WEBHOOK_SECRET` | Secret for the Preview webhook endpoint | Secret for the Production webhook endpoint |

`VERCEL_ENV` is supplied by Vercel and is part of the guard. Local development and Preview deployments must not receive the Production expectation or credentials.

## Manual Production rollout checklist

Perform these steps only after review and approval:

- [ ] Create or select the dedicated Mux Production environment under the intended Mux account.
- [ ] Record its exact environment ID and confirm Mux reports its type as `production`.
- [ ] Create a Production access token with `video:read` and `video:write`; keep both values server-only.
- [ ] Create a Production playback signing key and keep its key ID/private key server-only.
- [ ] Configure the seven Production variables listed above only in the Vercel Production scope.
- [ ] Confirm Preview contains only the corresponding development-environment values.
- [ ] Redeploy Preview and Production so each process starts with its own coherent configuration snapshot.
- [ ] Configure a Production Mux webhook for the existing endpoint and supported video events, then add only its Production signing secret to Vercel Production.
- [ ] Upload or duplicate one QA video into Mux Production; do not reuse a Preview asset or playback ID.
- [ ] Associate that Production playback reference only with a dedicated QA lesson.
- [ ] Verify anonymous/Free access is blocked for the protected QA lesson.
- [ ] Verify Plus and Pro receive working signed playback for the protected QA lesson.
- [ ] Verify an explicitly public preview lesson uses public playback as designed.
- [ ] Verify a lesson from a separate, non-entitled course remains blocked.
- [ ] Confirm a wrong environment ID/type, missing expected variable, invalid token, or insufficient permission produces no upload, asset read, synchronization, or signed URL.
- [ ] Remove the QA lesson association and retire the QA fixture according to the approved cleanup procedure.

## Known non-blocking debts

- Signed playback JWTs still use the existing four-hour lifetime.
- Asset cleanup remains a separate operational workflow.
- Preview still relies on a shared QA fixture.
- Orphan upload/asset lifecycle cleanup remains to be formalized.
