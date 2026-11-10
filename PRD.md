# SignMeOut — Backend Product Requirements Document (PRD)

**Version:** 1.1  
**Date:** 8 November 2026  
**Status:** Development Planning  
**Project:** SignMeOut  
**Architecture:** Modular Monolith  
**Backend:** Node.js + Express.js + TypeScript  
**Database:** PostgreSQL + Prisma ORM

---

## 1. Project Overview

SignMeOut is a digital signing-out platform designed for graduating university students in Nigeria.

Students create accounts, select their university and department, provide their bank details, and generate virtual 3D signing-out shirts.

Each student can create a maximum of two shirts:

- A white, oversized short-sleeve, round-neck T-shirt.
- A white, relaxed-fit, long-sleeve button-down shirt with a collar.

Students share their shirt links with friends, classmates, and family members.

Contributors do not need accounts. They can visit a public shirt link, send a monetary gift starting from ₦2,000, and leave a digital signature on the shirt.

SignMeOut earns 15% of every successful contribution, while the shirt owner receives 85%.

The platform bears payment-processing and transfer fees from its commission.

Onboarding collects student identity details as self-attestation; it does not
currently accept document uploads or independently prove student status.
Withdrawals require completed onboarding, a validated payout account, and
sufficient available balance, but do not apply a separate verification gate.

### Backend responsibilities

The backend will manage:

- Authentication and authorization.
- User profiles and onboarding.
- Nigerian universities and departments.
- Bank account verification.
- Shirt creation and public links.
- Payment initialization and verification.
- Digital signature authorization and storage.
- Signature positioning and collision detection.
- Financial ledger and earnings.
- Student identity verification.
- Withdrawal requests and payouts.
- Administrative operations.
- Security, auditing, and notifications.

The backend will expose a versioned REST API consumed by the Vue frontend.

---

## 2. Technical Stack

| Layer                 | Technology                           |
| --------------------- | ------------------------------------ |
| Runtime               | Node.js LTS                          |
| Language              | TypeScript                           |
| Framework             | Express.js 5                         |
| Database              | PostgreSQL                           |
| ORM                   | Prisma                               |
| Authentication        | Better Auth                          |
| Validation            | Zod                                  |
| Payments              | Paystack                             |
| File storage          | Cloudflare R2                        |
| Logging               | Pino                                 |
| Security              | Helmet, CORS, rate limiting          |
| Testing               | Vitest, Supertest                    |
| API documentation     | OpenAPI + Scalar                     |
| Development           | tsx                                  |
| Background processing | Redis + BullMQ when required         |
| Deployment            | Node.js hosting + managed PostgreSQL |

### Architecture decisions

1. Use a modular monolith rather than microservices.
2. Keep frontend and backend in separate repositories.
3. Use REST APIs with `/api/v1` versioning.
4. Use PostgreSQL transactions for financial operations.
5. Keep payment-provider integrations isolated from business logic.
6. Store all monetary amounts as integer kobo.
7. Never trust frontend calculations for payments, balances, or permissions.
8. Implement asynchronous processing for operations requiring retries.
9. Use strict TypeScript and validated environment configuration.

---

## 3. User Roles

### 3.1 Shirt Owner

A registered student who can:

- Create an account.
- Select university and department.
- Provide bank account details.
- Accept the 15% commission policy.
- Create up to two shirts.
- Share public shirt links.
- View signatures and contributors.
- Monitor earnings and transactions.
- Submit student verification.
- Request withdrawals.
- Manage their profile.

### 3.2 Contributor

An unauthenticated visitor who can:

- Open a public shirt link.
- View the shirt and existing signatures.
- Select a gift amount.
- Choose an eligible signature size.
- Complete payment.
- Draw or type a signature.
- Position and submit the signature.
- Resume an incomplete signing session securely.

Contributors must not be required to create accounts.

### 3.3 Administrator

An authorized platform operator who can:

- Review student verification requests.
- Approve or reject submitted evidence.
- Inspect payment and withdrawal records.
- Investigate suspicious transactions.
- Review failed payouts.
- Manage supported schools and departments.
- Handle refunds and disputes.
- View audit logs.
- Manage platform configuration.

Administrative actions must be logged.

---

## 4. Authentication and Authorization

### 4.1 Authentication provider

Use Better Auth with PostgreSQL and Prisma.

### 4.2 Required features

- Passwordless email OTP sign-up and sign-in.
- Google OAuth sign-in.
- OTP expiration, resend limits, and attempt limits.
- Login and logout.
- Session management.
- Protected owner endpoints.
- Role-based administrator authorization.
- Session expiration and revocation.

### 4.3 Authorization rules

- Owners can access only their own private data.
- Owners cannot modify other owners' shirts.
- Contributors can access public shirt information without authentication.
- Signing requires a verified payment entitlement.
- Withdrawals require an authenticated, approved student.
- Administrative endpoints require an administrator role.

### 4.4 Security requirements

- Secure, HttpOnly session cookies.
- Appropriate SameSite and CSRF protections.
- Restricted CORS origins.
- Login rate limiting.
- Password reset token expiration.
- Server-side authorization checks.

---

## 5. User Onboarding Module

### 5.1 Onboarding sequence

1. User registers.
2. User selects university.
3. User selects department.
4. User enters bank account details.
5. Backend verifies bank account information.
6. User acknowledges the 15% platform commission.
7. Backend marks onboarding as completed.
8. User gains access to the dashboard.

### 5.2 University management

Maintain a curated directory of Nigerian universities.

Each university should have:

- Unique ID.
- Official name.
- Optional abbreviation.
- Institution type.
- Active status.

Departments should be associated with their respective universities.

Support an administrator-reviewed option for universities or departments not yet listed.

### 5.3 Bank account management

Bank data should be retrieved from Paystack's supported institution directory rather than relying exclusively on a hardcoded list.

The platform should support eligible traditional and digital banks, including Access Bank, GTBank, UBA, Zenith Bank, Wema Bank, OPay, Moniepoint, Kuda, PalmPay, and other institutions returned by the payment provider.

Backend requirements:

- Retrieve supported banks.
- Resolve account number and bank code.
- Display the verified account name.
- Save bank details securely.
- Prevent unauthorized bank account changes.
- Create or update transfer recipients when supported.
- Revalidate sensitive payout details when necessary.

### 5.4 Commission acknowledgement

The user must explicitly acknowledge that:

- SignMeOut retains 15% of every successful payment.
- The owner receives 85%.
- The platform bears applicable payment-processing and transfer fees.

Store the accepted policy version and timestamp.

---

## 6. Shirt Management Module

### 6.1 Shirt types

Supported shirt types:

**SHORT_SLEEVE**

- Pure-white fabric.
- XL oversized/relaxed fit.
- Short sleeves.
- Round/crew neckline.

**LONG_SLEEVE**

- Pure-white fabric.
- Relaxed fit.
- Long sleeves.
- Button-down front.
- Traditional collar and cuffs.

### 6.2 Business rules

- Each owner can create a maximum of two shirts.
- Only one shirt of each type is permitted.
- Shirt creation is free.
- Each shirt receives a unique public identifier.
- Each shirt references a versioned 3D model.
- Shirts can have active, paused, full, or archived states.
- A shirt cannot accept new purchases when unavailable or full.

### 6.3 Shirt data

Store:

- Shirt ID.
- Owner ID.
- Shirt type.
- Public slug.
- 3D model version.
- Status.
- Creation timestamp.
- Last updated timestamp.

### 6.4 Public access

A public shirt endpoint should return only safe information, such as:

- Shirt type.
- Owner display name.
- Public school information, where permitted.
- Model reference.
- Existing public signatures.
- Whether signing is available.

Never expose bank information, private identity documents, or internal financial records.

---

## 7. Signature Management Module

### 7.1 Signature workflow

1. Contributor completes a payment.
2. Backend verifies the payment.
3. Backend creates a single-use signing entitlement.
4. Contributor opens the signing editor.
5. Contributor draws or types a signature.
6. Contributor chooses a valid position and rotation.
7. Backend validates the submission.
8. Backend stores the signature.
9. The signature appears on the 3D shirt.

### 7.2 Signature size rules

| Gift amount      | Available signature sizes |
| ---------------- | ------------------------- |
| ₦2,000–₦4,999    | 1×                        |
| ₦5,000 and above | 1×, 2×, 3×, 4×            |

Signature enlargement charges:

| Size | Additional fee |
| ---- | -------------- |
| 1×   | ₦0             |
| 2×   | ₦500           |
| 3×   | ₦700           |
| 4×   | ₦1,000         |

Eligibility must be calculated using the gift amount before the enlargement surcharge.

### 7.3 Signature data

Store:

- Signature ID.
- Shirt ID.
- Payment ID.
- Signing entitlement ID.
- Signature asset key.
- Surface identifier.
- UV coordinates.
- Width and height.
- Rotation.
- Authorized scale.
- Maximum signature scale paid for at checkout.
- Submission timestamp.
- Visibility status.

### 7.4 Placement validation

The backend must:

- Validate signature bounds.
- Reject invalid coordinates.
- Prevent placement on restricted fabric regions.
- Prevent overlapping existing signatures.
- Validate size against the paid entitlement.
- Prevent reuse of signing entitlements.
- Handle concurrent placement requests.
- Reject submissions when no valid space remains.

The frontend handles interactive preview and 3D rendering; the backend is responsible for authoritative placement validation.

### 7.5 Model mapping

Each shirt model must have a versioned placement configuration containing:

- Valid signing surfaces.
- UV coordinate mapping.
- Restricted areas.
- Supported signature dimensions.
- Collision boundaries.

Changing a model must not silently invalidate existing signatures.

### 7.6 Signature storage

Store signature assets in Cloudflare R2.

Use controlled uploads and validate:

- File type.
- File size.
- Asset dimensions.
- Content format.
- Ownership of the signing entitlement.

Avoid accepting arbitrary executable SVG or untrusted HTML content.

Issue short-lived, entitlement-scoped upload URLs. Validate uploaded file bytes,
dimensions, format, and entitlement metadata server-side; normalize accepted
images before persisting a canonical private asset. Public signature assets are
served through short-lived signed reads, never by exposing storage keys.
Signing placement remains unavailable until an administrator configures the
versioned model surfaces, bounds, restricted regions, and maximum dimensions.

---

## 8. Payment Module

### 8.1 Payment provider

Use Paystack for payment collection and transaction verification.

Production fund handling is conditional on Paystack confirming that the account and business model support the intended third-party collection and withdrawal arrangement.

### 8.2 Payment rules

- Minimum gift: ₦2,000.
- Payment currency: NGN.
- Total payment equals gift plus signature enlargement fee.
- Owner allocation: 85%.
- Platform allocation: 15%.
- Paystack fees are borne by the platform.
- The owner must not be charged platform processing or withdrawal fees.

### 8.3 Payment calculation

All monetary values must be calculated in integer kobo.

When a percentage calculation cannot be represented as a whole kobo, round the
platform allocation down and assign the remaining kobo to the owner. The owner
and platform allocations must always sum exactly to the gross payment.

Example:

Gift: ₦5,000  
Signature size: 4×  
Enlargement fee: ₦1,000  
Total payment: ₦6,000  
Platform allocation: ₦900  
Owner allocation: ₦5,100

The owner's allocation must not be reduced by Paystack fees.

### 8.4 Checkout initialization

**Endpoint:** `POST /api/v1/public/shirts/:slug/checkout`

The backend must:

1. Validate the shirt.
2. Check signing availability.
3. Validate gift amount.
4. Validate signature size eligibility.
5. Calculate the total.
6. Generate a unique payment reference.
7. Create a pending payment record.
8. Initialize a Paystack transaction.
9. Return the checkout authorization URL.

### 8.5 Webhook processing

**Endpoint:** `POST /api/v1/webhooks/paystack`

Requirements:

- Receive the raw request body.
- Verify the Paystack webhook signature.
- Verify the transaction reference.
- Confirm successful payment status.
- Confirm the expected amount and currency.
- Prevent duplicate processing.
- Record payment allocation in a database transaction.
- Create a signing entitlement.
- Return a successful response promptly.

### 8.6 Idempotency

A successful payment must never create:

- Multiple owner credits.
- Multiple platform revenue credits.
- Multiple signing entitlements.

Process payment status transitions atomically from `PENDING` and enforce unique
ledger idempotency keys at the database level. Store the selected signature
size, allocation basis points, and commission policy version with the payment so
later signing requests and financial reviews can verify the paid entitlement.

### 8.7 Payment recovery

Support:

- Failed payments.
- Abandoned checkouts.
- Delayed webhook delivery.
- Duplicate webhook delivery.
- Successful payments followed by interrupted signing.
- Payment reconciliation.
- Refund and dispute workflows.

The exact refund, chargeback, and unclaimed-signature policies must be finalized before launch.

---

## 9. Financial Ledger Module

### 9.1 Purpose

The ledger is the authoritative record of money allocated to owners, platform revenue, processing costs, and withdrawals.

### 9.2 Core rules

- Ledger records are append-only.
- Corrections are recorded as new entries.
- Balances are derived from ledger records.
- Financial operations use database transactions.
- No frontend-provided balance is trusted.
- Each financial event must be traceable to its source.
- Reconciliation must detect discrepancies.

### 9.3 Ledger entry categories

Examples:

- OWNER_CREDIT
- PLATFORM_REVENUE
- GATEWAY_FEE
- WITHDRAWAL_HOLD
- WITHDRAWAL_RELEASE
- WITHDRAWAL_COMPLETED
- TRANSFER_FEE
- REFUND_ADJUSTMENT
- CHARGEBACK_ADJUSTMENT

### 9.4 Owner balances

Expose:

- Pending balance.
- Available balance.
- Reserved withdrawal balance.
- Total earned.
- Total withdrawn.

An owner's balance must only include ledger entries attributable to that owner.

Platform revenue and platform-paid processing fees must not reduce the owner's 85% allocation.

### 9.5 Reconciliation

The system must reconcile:

- Successful Paystack payments.
- Recorded owner liabilities.
- Platform commission.
- Processing fees.
- Available settlement or transfer balance.
- Pending withdrawals.
- Completed transfers.
- Refunds and reversals.

The ledger must distinguish recorded owner liabilities from money actually available for payout.

---

## 10. Student Verification Module

### 10.1 Purpose

Collect the student's full name and admission number, with an optional
nickname. Submission is automatically marked approved as self-attestation; the
backend does not independently verify the identity details. Additional identity
checks required by Paystack or applicable law remain subject to provider and
legal review.

### 10.2 Verification requirements

The onboarding submission requires full name and admission number. Nickname is
optional. Document upload is not part of the current onboarding flow.

### 10.3 Verification states

- NOT_SUBMITTED
- PENDING
- APPROVED
- REJECTED
- REQUIRES_RESUBMISSION

### 10.4 Verification process

1. Owner submits full name and admission number, with an optional nickname.
2. Backend validates required fields and marks the submission approved as
   self-attestation.
3. This submission completes the student-details onboarding step. Withdrawal
   eligibility is based on onboarding completion, bank validation, and balance,
   with no separate verification gate.

### 10.5 Security

- Do not describe this self-attestation flow as independent identity verification.
- Defined document retention periods.
- Auto-approval is only completion of the self-attestation step; it must not be
  represented as independent identity or document verification.
- Compliance with applicable Nigerian data protection requirements.

---

## 11. Withdrawal Module

### 11.1 Withdrawal eligibility

An owner can request withdrawal only when:

- Authenticated.
- Onboarding is complete.
- Bank account is validated.
- Sufficient available balance exists.
- No applicable withdrawal restriction exists.

### 11.2 Withdrawal workflow

1. Owner requests withdrawal.
2. Backend validates eligibility.
3. Backend requires an idempotency key and serializes balance reservation.
4. Available balance is calculated.
5. Requested funds are reserved.
6. Withdrawal record is created.
7. A durable alert is queued for delivery to the configured administrator by
   email and signed webhook, including the full payout account number.
8. The request waits 10 minutes after submission, during which the owner can
   cancel and release the reserved funds.
9. After the wait, the automatic payout worker initiates a Paystack transfer
   when transfers are enabled and provider/compliance approval is recorded.
10. Transfer status is monitored and reconciled with Paystack. Uncertain
    results are checked against the original provider reference and are never
    blindly resubmitted.
11. The ledger is updated only after the provider's final status is confirmed.

The 10-minute wait is not a guarantee of bank settlement within that period.
Confirmed transfer failures release the hold, confirmed reversals restore the
balance through a reversal ledger entry, and provider-action-required transfers
remain unpaid until resolved. If transfers are disabled, the request remains
pending with funds reserved after the wait.
Payout account details are snapshotted on the withdrawal so later bank-account
changes cannot redirect an existing request.

### 11.3 Withdrawal statuses

- PENDING
- PROCESSING
- REQUIRES_ACTION
- PAID
- FAILED
- REVERSED
- CANCELLED

### 11.4 Failure handling

- Prevent duplicate transfers.
- Do not mark a withdrawal paid from an initial transfer API response alone.
- Reconcile ambiguous transfer states before retrying.
- Release reserved funds only after confirmed failure or reversal.
- Maintain an audit trail for each state change.
- Use unique transfer references and idempotency keys.
- Keep transfer initiation disabled until payment-provider and compliance
  approvals are recorded.

### 11.5 Provider dependency

The intended design assumes platform-managed withdrawals.

Before live deployment, confirm Paystack approval for:

- Collecting payments involving student beneficiaries.
- Retaining funds pending withdrawal.
- The required settlement or balance arrangement.
- Initiating bank transfers.
- Applicable identity and business verification obligations.

A verified Paystack account alone does not establish approval for all these operations.

---

## 12. Dashboard and Analytics Module

Provide authenticated endpoints for the owner dashboard.

### Required metrics

- Total successful gifts.
- Total gross contributions.
- Total owner earnings.
- Available balance.
- Pending balance.
- Total withdrawn.
- Number of signatures.
- Number of contributors.
- Recent transactions.
- Recent signatures.
- Withdrawal history.
- Verification status.

Use efficient database queries and pagination.

Analytics must distinguish successful payments from pending and failed payments.

---

## 13. Administrative Module

### Required capabilities

**Verification management**

- View verification queue.
- Review evidence.
- Approve or reject requests.
- Request resubmission.

**Payment management**

- View payment records.
- Investigate discrepancies.
- Review refunds and disputes.
- Monitor reconciliation.

**Withdrawal management**

- View payout requests.
- Investigate failed transfers.
- Review suspicious withdrawals.
- Apply authorized administrative controls.

**Platform management**

- Manage schools and departments.
- Manage shirt configuration.
- Monitor operational metrics.
- Review security events.

### Administrative security

- Role-based permissions.
- Strong administrator authentication.
- Audit logs for sensitive actions.
- Restricted document access.
- No direct editing of immutable ledger records.

---

## 14. Notifications Module

The backend should support email notifications for:

- Account verification.
- Password reset.
- Onboarding completion.
- New contributions.
- Student verification decisions.
- Withdrawal requests.
- Successful payouts.
- Failed withdrawals.
- Important account changes.

Notifications should not block successful payment processing.

Use a provider abstraction so email services can be replaced later.

---

## 15. Database Models

### Core tables

| Table                | Purpose                                        |
| -------------------- | ---------------------------------------------- |
| User                 | Owner and administrator identities             |
| Session / Account    | Better Auth session and authentication records |
| OwnerProfile         | Student profile and onboarding state           |
| School               | University directory                           |
| Department           | Department directory                           |
| BankAccount          | Verified payout account                        |
| CommissionAcceptance | Accepted commission policy                     |
| Shirt                | Virtual shirt records                          |
| ShirtModelVersion    | Model and signing-region configuration         |
| Payment              | Contributor payments                           |
| PaymentEvent         | Payment-provider events                        |
| SigningEntitlement   | One-time signing authorization                 |
| Signature            | Digital signatures and placement               |
| LedgerEntry          | Financial records                              |
| StudentVerification  | Verification requests                          |
| VerificationDocument | Private identity evidence                      |
| Withdrawal           | Withdrawal and payout records                  |
| AdminAuditLog        | Administrative actions                         |
| Notification         | Notification delivery records                  |

### Important database constraints

- Unique user email.
- Unique shirt public slug.
- Unique `(ownerId, shirtType)`.
- Unique Paystack payment reference.
- Unique signing entitlement per payment.
- Unique signature per signing entitlement.
- Unique ledger idempotency key.
- Unique withdrawal idempotency key.
- Unique provider transfer reference.
- Appropriate foreign keys and indexes.
- Database checks for valid financial amounts where supported.

All financial timestamps should be stored consistently, preferably in UTC.

---

## 16. REST API Specification

Base URL:

`/api/v1`

### Authentication

Authentication routes will be provided by Better Auth under its configured mount path.
Email OTP sign-in may create a new owner account after the code is verified.
Google OAuth credentials must be configured outside source control.

### Owner and onboarding

| Method | Endpoint                   |
| ------ | -------------------------- |
| GET    | `/me`                      |
| PATCH  | `/me`                      |
| GET    | `/schools`                 |
| GET    | `/schools/:id/departments` |
| GET    | `/banks`                   |
| POST   | `/banks/resolve`           |
| PATCH  | `/onboarding/profile`      |
| POST   | `/onboarding/student-verification/upload` |
| POST   | `/onboarding/student-verification` |
| POST   | `/onboarding/bank`         |
| POST   | `/onboarding/commission`   |
| GET    | `/onboarding/status`       |

### Shirts

| Method | Endpoint                          |
| ------ | --------------------------------- |
| POST   | `/shirts`                         |
| GET    | `/shirts`                         |
| GET    | `/shirts/:id`                     |
| PATCH  | `/shirts/:id`                     |
| GET    | `/public/shirts/:slug`            |
| GET    | `/public/shirts/:slug/signatures` |

### Payments

| Method | Endpoint                        |
| ------ | ------------------------------- |
| POST   | `/public/shirts/:slug/checkout` |
| GET    | `/payments/:reference/status`   |
| POST   | `/webhooks/paystack`            |

### Signatures

| Method | Endpoint                          |
| ------ | --------------------------------- |
| POST   | `/signing/resume`                 |
| POST   | `/signing/assets`                 |
| POST   | `/signatures`                     |
| GET    | `/public/shirts/:slug/signatures` |
| GET    | `/public/signatures/:id/asset`    |

### Dashboard and earnings

| Method | Endpoint               |
| ------ | ---------------------- |
| GET    | `/dashboard/summary`   |
| GET    | `/wallet/balance`      |
| GET    | `/wallet/transactions` |

### Verification and withdrawals

| Method | Endpoint                |
| ------ | ----------------------- |
| POST   | `/verifications`        |
| GET    | `/verifications/status` |
| POST   | `/withdrawals`          |
| GET    | `/withdrawals`          |
| GET    | `/withdrawals/:id`      |
| POST   | `/withdrawals/:id/cancel` |

### Administration

| Method | Endpoint                   |
| ------ | -------------------------- |
| GET    | `/admin/verifications`     |
| PATCH  | `/admin/verifications/:id` |
| GET    | `/admin/payments`          |
| GET    | `/admin/withdrawals`       |
| GET    | `/admin/audit-logs`        |
| PUT    | `/admin/shirt-models/:id/placement-config` |
| POST   | `/admin/withdrawals/:id/transfer` |
| POST   | `/admin/withdrawals/:id/reconcile` |

### API response conventions

Use consistent:

- Success responses.
- Error codes.
- Validation errors.
- Pagination metadata.
- Authentication errors.
- Authorization errors.
- Request IDs.

Avoid exposing internal stack traces or secrets.

---

## 17. Backend Folder Structure

```text
signmeout-backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── config/
│   │   ├── env.ts
│   │   ├── database.ts
│   │   └── auth.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── onboarding/
│   │   ├── schools/
│   │   ├── banks/
│   │   ├── shirts/
│   │   ├── signatures/
│   │   ├── payments/
│   │   ├── ledger/
│   │   ├── dashboard/
│   │   ├── verification/
│   │   ├── withdrawals/
│   │   ├── notifications/
│   │   └── admin/
│   ├── integrations/
│   │   ├── paystack/
│   │   ├── storage/
│   │   └── email/
│   ├── middleware/
│   ├── lib/
│   ├── jobs/
│   ├── app.ts
│   └── server.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
├── .gitignore
├── package.json
└── tsconfig.json
```

### Module structure

Each feature module should follow a consistent pattern:

```text
payments/
├── payment.routes.ts
├── payment.controller.ts
├── payment.service.ts
├── payment.repository.ts
├── payment.schema.ts
└── payment.types.ts
```

**Controller:** HTTP request and response handling.  
**Service:** Business rules and orchestration.  
**Repository:** Database queries.  
**Schema:** Input validation.  
**Types:** Feature-specific TypeScript types.

Modules should communicate through defined service interfaces rather than directly modifying one another's database records.

---

## 18. Security Requirements

The backend must implement:

- HTTPS in production.
- Secure authentication and session management.
- Authorization on every protected resource.
- Zod validation for untrusted input.
- Paystack webhook signature verification.
- Payment amount and currency verification.
- Idempotent financial operations.
- Rate limiting.
- Secure file uploads.
- Private student document storage.
- Secrets stored outside source control.
- Restricted administrative access.
- Audit logs.
- Database backups.
- Sensitive-data redaction in logs.
- Fraud monitoring.
- Documented retention and deletion policies.

Never store Paystack secret keys in the frontend.

---

## 19. Testing Requirements

### Unit tests

Test:

- Minimum gift validation.
- Signature size eligibility.
- Enlargement pricing.
- 85/15 allocation.
- Integer rounding.
- Shirt creation limits.
- Signature placement boundaries.
- Collision detection.
- Withdrawal eligibility.
- Balance calculations.

### Integration tests

Test:

- Signup and login.
- Onboarding completion.
- Bank account resolution.
- Shirt creation.
- Checkout initialization.
- Verified payment webhook.
- Duplicate webhook delivery.
- Signing entitlement consumption.
- Concurrent signature placement.
- Student verification review.
- Concurrent withdrawal requests.
- Failed and reversed transfers.

### Financial invariants

Tests must confirm:

1. Owner share plus platform share equals the gross payment.
2. Payment fees never reduce the owner's contractual 85%.
3. Duplicate events cannot create duplicate credits.
4. One successful payment cannot create multiple signatures.
5. An owner cannot withdraw more than the available balance.
6. Reserved funds cannot be withdrawn twice.
7. Transfer failures cannot cause double refunds of reserved funds.
8. Every financial adjustment is auditable.

---

## 20. Development Roadmap

### Phase 1 — Backend Foundation

**Goal:** Establish a working backend and database.

Tasks:

- Initialize Node.js and TypeScript.
- Configure Express.
- Configure PostgreSQL.
- Install Prisma.
- Configure environment validation.
- Add logging and error handling.
- Set up API routing.
- Configure testing.
- Create initial migrations.

**Deliverable:** Running API connected to PostgreSQL.

### Phase 2 — Authentication

**Goal:** Enable secure account creation and login.

Tasks:

- Integrate Better Auth.
- Configure sessions.
- Implement registration and login.
- Implement email verification.
- Implement password reset.
- Add owner and admin authorization.

**Deliverable:** Working authentication system.

### Phase 3 — Onboarding

**Goal:** Allow students to complete their profiles.

Tasks:

- Create school and department models.
- Seed Nigerian university records.
- Implement bank directory integration.
- Implement bank account resolution.
- Store verified bank information.
- Implement commission acknowledgement.
- Track onboarding progress.

**Deliverable:** Complete owner onboarding API.

### Phase 4 — Shirt Management

**Goal:** Allow owners to create and share shirts.

Tasks:

- Create shirt database models.
- Enforce two-shirt limit.
- Generate unique public slugs.
- Implement shirt management endpoints.
- Support versioned 3D model references.
- Expose public shirt data.

**Deliverable:** Functional shirt management API.

### Phase 5 — Payment Integration

**Goal:** Accept contributions and allocate earnings.

Tasks:

- Implement pricing service.
- Integrate Paystack checkout.
- Verify webhooks.
- Implement payment idempotency.
- Record 85/15 allocations.
- Build financial ledger.
- Implement payment reconciliation.

**Deliverable:** Tested payment and ledger system.

Live activation depends on provider and compliance approval.

### Phase 6 — Signature Management

**Goal:** Enable paid digital signatures.

Tasks:

- Implement signing entitlements.
- Implement secure asset uploads.
- Define signing regions.
- Validate UV coordinates.
- Implement collision detection.
- Persist signatures.
- Support signing recovery.
- Expose public signature data.

**Deliverable:** Fully functional backend signing workflow.

### Phase 7 — Dashboard and Verification

**Goal:** Provide earnings visibility and identity checks.

Tasks:

- Implement dashboard analytics.
- Implement wallet balance endpoints.
- Build transaction history.
- Keep onboarding student details as self-attestation; document uploads and
  administrator review are deferred.

**Deliverable:** Owner dashboard data and verification APIs.

### Phase 8 — Withdrawals

**Goal:** Enable secure student payouts.

Tasks:

- Implement withdrawal eligibility.
- Reserve available balances.
- Integrate approved payout provider.
- Automatically initiate approved transfers after the 10-minute waiting period.
- Process transfer webhooks.
- Reconcile final transfer status.
- Implement failure and reversal handling.

**Deliverable:** Tested withdrawal system.

### Phase 9 — Production Readiness

**Goal:** Prepare for launch.

Tasks:

- Complete security review.
- Load-test payment and signature endpoints.
- Test concurrent financial operations.
- Configure backups and monitoring.
- Verify Paystack production settings.
- Finalize compliance requirements.
- Deploy backend.
- Run end-to-end staging tests.

**Deliverable:** Production-ready SignMeOut API.

---

## 21. Non-Functional Requirements

### Reliability

- Financial transactions must be idempotent.
- Critical operations must have defined retry behavior.
- Provider outages must not corrupt internal financial records.
- Database backups and recovery procedures must be maintained.

### Performance

- Paginate large result sets.
- Index frequently queried database fields.
- Avoid transferring large signature assets through the application server when direct controlled storage access is appropriate.
- Keep 3D model rendering on the frontend.
- Optimize public shirt and signature retrieval.

### Maintainability

- Strict TypeScript.
- Feature-based modules.
- Consistent API responses.
- Automated tests.
- Database migrations.
- Structured logging.
- API documentation.

### Scalability

The architecture should support future adoption of:

- Background workers.
- Redis caching.
- Realtime signature updates.
- Dedicated payment reconciliation workers.
- Separate reporting services.

These should be introduced when actual usage justifies them.

---

## 22. Outstanding Decisions

The following must be finalized before the relevant production features are activated:

1. Confirmation of Paystack's approval for platform-managed student funds and withdrawals.
2. Paystack settlement and transfer-balance configuration.
3. Business registration and applicable regulatory requirements.
4. Minimum withdrawal amount, if any.
5. Waiting period before funds become withdrawable.
6. Refund and chargeback allocation.
7. Handling paid signatures that cannot be placed.
8. Exact definition of 2×, 3×, and 4× signature dimensions.
9. Whether signatures can appear on both sides and sleeves.
10. Whether owners can hide or remove signatures.
11. Student verification document requirements.
12. Administrative payout approval thresholds.
13. File retention and deletion policy.
14. Final email service and hosting providers.

---

## 23. MVP Acceptance Criteria

The backend MVP is complete when:

- Students can register and authenticate securely.
- Owners can complete onboarding.
- Supported Nigerian bank accounts can be validated.
- The 15% commission policy is explicitly acknowledged.
- Owners can create one shirt of each supported type.
- Every shirt has a shareable public link.
- Contributors can initiate payments without accounts.
- Payment amounts and signature sizes are validated server-side.
- Successful payments create exactly one 85/15 financial allocation.
- Contributors receive one signing entitlement per successful payment.
- Signatures are securely stored and correctly associated with shirt surfaces.
- Owners can view accurate earnings and transaction histories.
- Withdrawals do not require a separate student-verification gate beyond
  completion of onboarding.
- Each withdrawal reserves funds, snapshots payout details, and queues email
  and signed-webhook administrator alerts, then starts the approved automatic
  payout flow after a 10-minute waiting period.
- Authorized administrators can review verification requests.
- Withdrawals cannot exceed available balances.
- Transfers are reconciled without duplicate payouts.
- Sensitive data is protected.
- Critical payment and withdrawal tests pass.
- The live financial workflow has received the necessary provider and compliance approvals.

---

## 24. Development Principles

1. **Correctness before complexity.** Start with a maintainable modular monolith.
2. **Security by default.** Every protected operation requires server-side authorization.
3. **Financial integrity first.** Never compromise ledger correctness for convenience.
4. **Frontend is not authoritative.** Pricing, payments, permissions, and balances are backend responsibilities.
5. **Provider-independent business logic.** Keep Paystack integration separate from the core ledger.
6. **Incremental delivery.** Complete and test each module before expanding.
7. **Production readiness is explicit.** A working development integration is not equivalent to approval for handling live customer funds.

**End of Backend PRD — SignMeOut v1.0**
