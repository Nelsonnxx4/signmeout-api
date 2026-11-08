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

Update `DATABASE_URL` in `.env` if your local PostgreSQL credentials differ
from the example. Paystack and Better Auth secrets are not needed for the
current foundation, but will be required when those modules are implemented.

## Verification

```powershell
npm run db:validate
npm run typecheck
npm test
npm run build
```

The product requirements and delivery roadmap are documented in [PRD.md](./PRD.md).

