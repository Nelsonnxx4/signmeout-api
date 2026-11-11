# SignMeOut API

Backend API for SignMeOut, a digital signing-out platform for graduating
university students in Nigeria.

## Current foundation

- Express 5 with a versioned `/api/v1` router
- Strict TypeScript and validated environment configuration
- PostgreSQL and Prisma
- Pino structured logging with sensitive-field redaction
- Helmet, CORS, rate limiting, request IDs, and consistent errors
- Health endpoint at `GET /api/v1/health`
- Better Auth email OTP and Google OAuth authentication
- Versioned commission policy and integer-kobo allocation service
- Vitest unit and integration tests

The current commission policy allocates 15% to SignMeOut and 85% to the shirt
owner. When a percentage produces a fractional kobo, the platform share is
rounded down and the owner receives the remainder.

## Local setup

Prerequisites:

- Node.js 22 or newer
- PostgreSQL

Install and prepare the project:

```powershell
Copy-Item .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

For a deployed database, run `npm run db:deploy` before starting the API. The
repository includes a non-root, multi-stage `Dockerfile` and a GitHub Actions
workflow that validates Prisma, typechecks, tests, and builds each change.

Update `DATABASE_URL` in `.env` if your local PostgreSQL credentials differ
from the example. Paystack and Better Auth secrets are not needed for the
development foundation. Email OTP messages are printed by the development email
provider. Configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to enable
Google sign-in. Production requires `BETTER_AUTH_SECRET`, Google OAuth
credentials, and a configured email provider. Register this Google OAuth
callback URL with Google:
`http://localhost:5000/api/v1/auth/callback/google` (replace the host in
production).

The database seed loads the configured university list and the 10 supported
department choices. In production, the bank dropdown is loaded from Paystack's
supported Nigerian bank directory and account-name resolution is performed by
Paystack. Development without Paystack credentials uses the local fallback
catalog.

## Withdrawal request alerts

Withdrawal eligibility requires completed onboarding, a validated bank account,
and enough available ledger balance. The withdrawal endpoint does not apply an
additional student-verification gate. Destination bank details are snapshotted
with each request so later bank-account edits cannot redirect an already-requested
payout.

Each request reserves its balance, creates a durable notification job, and
sets a 10-minute waiting period. The alert worker retries email and webhook
delivery independently. When the waiting period ends, the payout worker
automatically initiates a Paystack transfer if transfers are enabled. The user
may cancel before transfer processing starts. The 10-minute period is not a
guarantee that a bank will settle the transfer within 10 minutes; Paystack and
bank processing can take longer.

The payout worker uses a database lock so multiple API instances do not start
the same transfer. It retries recipient preparation with backoff and reconciles
uncertain transfer results against Paystack using the original reference; it
never starts a second transfer just because a provider response timed out.
Confirmed failures release the reserved balance, while confirmed reversals add
the appropriate ledger entry. A payout that requires provider action remains
unpaid and must be resolved through the admin/provider workflow.

Keep `PAYSTACK_TRANSFERS_ENABLED=false` until Paystack and compliance approvals
are recorded. With transfers disabled, requests remain reserved after the
waiting period and no automatic payout is initiated.

Configure both delivery channels:

- `ADMIN_ALERT_EMAIL` is the recipient for withdrawal emails.
- `RESEND_API_KEY` and `EMAIL_FROM` configure the Resend email provider used
  for both sign-in OTPs and withdrawal notifications.
- `ADMIN_ALERT_WEBHOOK_URL` is called with a JSON `withdrawal.requested`
  event. `ADMIN_ALERT_WEBHOOK_SECRET` signs
  `${timestamp}.${rawBody}` with HMAC-SHA256. The request includes
  `X-SignMeOut-Timestamp`, `X-SignMeOut-Signature: sha256=<hex>`, and an
  `Idempotency-Key` header. Verify the signature and reject stale timestamps
  in the receiving service.

Both alerts contain the contributor's full bank account number as configured.
Restrict mailbox and webhook access, retain payloads only as long as needed,
and never log the raw alert body.

Onboarding student verification accepts full name and admission number, with an
optional nickname. Document upload and administrator review are not part of
this flow. Submission is automatically marked approved as self-attestation,
not as independent proof of student status.

Interactive OpenAPI documentation is available at `GET /api/v1/docs`, with the
machine-readable specification at `GET /api/v1/openapi.json`.

Signature uploads require a private Cloudflare R2 bucket configured with
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
`R2_BUCKET_NAME`. Configure the bucket CORS policy to permit the frontend
origin to `PUT` the signed upload URL with the returned `Content-Type` and
`x-amz-meta-entitlement` or `x-amz-meta-owner` headers. The backend validates and re-encodes the
uploaded PNG/JPEG/WebP before making it available.
Configure an R2 lifecycle rule to delete abandoned objects under the
`signature-uploads/` prefix after 24 hours.

Every `ShirtModelVersion` needs an administrator-supplied `placementConfig`
before signing is enabled. Set it with
`PUT /api/v1/admin/shirt-models/:id/placement-config`; the configuration
contains a version and normalized UV bounds, restricted regions, and maximum
signature dimensions for each surface. Missing configuration intentionally
fails closed rather than guessing shirt geometry.

Paystack transfer initiation is disabled by default. Keep
`PAYSTACK_TRANSFERS_ENABLED=false` until Paystack and compliance approvals are
recorded. When approved, configure the Paystack secret and explicitly set this
flag to `true`; the payout worker will then initiate due transfers after the
10-minute wait. Admin transfer initiation and reconciliation are exposed at
`POST /api/v1/admin/withdrawals/:id/transfer` and
`POST /api/v1/admin/withdrawals/:id/reconcile`; confirmed statuses are also
processed through the signed Paystack webhook. A contributor may cancel a
withdrawal through `POST /api/v1/withdrawals/:id/cancel` only before transfer
processing begins; that operation atomically releases the reserved balance.

## Verification

```powershell
npm run db:validate
npm run typecheck
npm test
npm run build
```

The product requirements and delivery roadmap are documented in [PRD.md](./PRD.md).
