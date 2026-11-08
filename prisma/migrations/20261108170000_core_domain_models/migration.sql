-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN');
CREATE TYPE "SchoolType" AS ENUM ('FEDERAL', 'STATE', 'PRIVATE');
CREATE TYPE "SchoolStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');
CREATE TYPE "VerificationStatus" AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED', 'REQUIRES_RESUBMISSION');
CREATE TYPE "ShirtType" AS ENUM ('SHORT_SLEEVE', 'LONG_SLEEVE');
CREATE TYPE "ShirtStatus" AS ENUM ('ACTIVE', 'PAUSED', 'FULL', 'ARCHIVED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');
CREATE TYPE "SigningEntitlementStatus" AS ENUM ('AVAILABLE', 'USED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "SignatureVisibilityStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'FLAGGED');
CREATE TYPE "LedgerEntryType" AS ENUM ('OWNER_CREDIT', 'PLATFORM_REVENUE', 'GATEWAY_FEE', 'WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASE', 'WITHDRAWAL_COMPLETED', 'TRANSFER_FEE', 'REFUND_ADJUSTMENT', 'CHARGEBACK_ADJUSTMENT');
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'REQUIRES_ACTION', 'PAID', 'FAILED', 'REVERSED', 'CANCELLED');

-- CreateTable: commission_policies
CREATE TABLE "commission_policies" (
    "id" UUID NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "platformBasisPoints" INTEGER NOT NULL,
    "ownerBasisPoints" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable: users
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "type" "SchoolType",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" "SchoolStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "status" "SchoolStatus" NOT NULL DEFAULT 'APPROVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "owner_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "schoolId" UUID,
    "departmentId" UUID,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "paystackRecipient" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commission_acceptances" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_verifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "reviewedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verification_documents" (
    "id" UUID NOT NULL,
    "verificationId" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shirt_model_versions" (
    "id" UUID NOT NULL,
    "shirtType" "ShirtType" NOT NULL,
    "version" INTEGER NOT NULL,
    "modelKey" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shirt_model_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shirts" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "shirtType" "ShirtType" NOT NULL,
    "slug" TEXT NOT NULL,
    "modelVersionId" UUID NOT NULL,
    "status" "ShirtStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shirts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "shirtId" UUID,
    "reference" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "giftAmountKobo" INTEGER NOT NULL,
    "enlargementFeeKobo" INTEGER NOT NULL,
    "grossAmountKobo" INTEGER NOT NULL,
    "ownerAmountKobo" INTEGER NOT NULL,
    "platformAmountKobo" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signing_entitlements" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "shirtId" UUID NOT NULL,
    "status" "SigningEntitlementStatus" NOT NULL DEFAULT 'AVAILABLE',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "signing_entitlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "signatures" (
    "id" UUID NOT NULL,
    "shirtId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "entitlementId" UUID NOT NULL,
    "assetKey" TEXT NOT NULL,
    "surfaceId" TEXT NOT NULL,
    "uvX" DOUBLE PRECISION NOT NULL,
    "uvY" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL,
    "scale" DOUBLE PRECISION NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visibility" "SignatureVisibilityStatus" NOT NULL DEFAULT 'VISIBLE',

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "ownerId" UUID,
    "paymentId" UUID,
    "withdrawalId" UUID,
    "entryType" "LedgerEntryType" NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "description" TEXT,
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "withdrawals" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "transferReference" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: commission_policies
CREATE UNIQUE INDEX "commission_policies_version_key" ON "commission_policies"("version");
CREATE INDEX "commission_policies_effectiveAt_idx" ON "commission_policies"("effectiveAt");

-- CreateIndex: users
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex: sessions
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex: accounts
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex: verifications
CREATE UNIQUE INDEX "verifications_identifier_value_key" ON "verifications"("identifier", "value");

-- CreateIndex: schools
CREATE UNIQUE INDEX "schools_name_key" ON "schools"("name");
CREATE INDEX "schools_status_active_idx" ON "schools"("status", "active");

-- CreateIndex: departments
CREATE UNIQUE INDEX "departments_schoolId_name_key" ON "departments"("schoolId", "name");
CREATE INDEX "departments_schoolId_status_active_idx" ON "departments"("schoolId", "status", "active");

-- CreateIndex: owner_profiles
CREATE UNIQUE INDEX "owner_profiles_userId_key" ON "owner_profiles"("userId");
CREATE INDEX "owner_profiles_schoolId_idx" ON "owner_profiles"("schoolId");
CREATE INDEX "owner_profiles_departmentId_idx" ON "owner_profiles"("departmentId");

-- CreateIndex: bank_accounts
CREATE UNIQUE INDEX "bank_accounts_userId_key" ON "bank_accounts"("userId");
CREATE INDEX "bank_accounts_bankCode_idx" ON "bank_accounts"("bankCode");

-- CreateIndex: commission_acceptances
CREATE UNIQUE INDEX "commission_acceptances_userId_policyVersion_key" ON "commission_acceptances"("userId", "policyVersion");
CREATE INDEX "commission_acceptances_policyVersion_idx" ON "commission_acceptances"("policyVersion");

-- CreateIndex: student_verifications
CREATE INDEX "student_verifications_userId_status_idx" ON "student_verifications"("userId", "status");

-- CreateIndex: verification_documents
CREATE INDEX "verification_documents_verificationId_idx" ON "verification_documents"("verificationId");

-- CreateIndex: shirt_model_versions
CREATE UNIQUE INDEX "shirt_model_versions_shirtType_version_key" ON "shirt_model_versions"("shirtType", "version");
CREATE INDEX "shirt_model_versions_shirtType_isCurrent_idx" ON "shirt_model_versions"("shirtType", "isCurrent");

-- CreateIndex: shirts
CREATE UNIQUE INDEX "shirts_slug_key" ON "shirts"("slug");
CREATE UNIQUE INDEX "shirts_ownerId_shirtType_key" ON "shirts"("ownerId", "shirtType");
CREATE INDEX "shirts_ownerId_idx" ON "shirts"("ownerId");
CREATE INDEX "shirts_status_idx" ON "shirts"("status");

-- CreateIndex: payments
CREATE UNIQUE INDEX "payments_reference_key" ON "payments"("reference");
CREATE INDEX "payments_ownerId_status_idx" ON "payments"("ownerId", "status");
CREATE INDEX "payments_shirtId_idx" ON "payments"("shirtId");

-- CreateIndex: payment_events
CREATE INDEX "payment_events_paymentId_receivedAt_idx" ON "payment_events"("paymentId", "receivedAt");

-- CreateIndex: signing_entitlements
CREATE UNIQUE INDEX "signing_entitlements_paymentId_key" ON "signing_entitlements"("paymentId");
CREATE INDEX "signing_entitlements_shirtId_status_idx" ON "signing_entitlements"("shirtId", "status");

-- CreateIndex: signatures
CREATE UNIQUE INDEX "signatures_entitlementId_key" ON "signatures"("entitlementId");
CREATE INDEX "signatures_shirtId_submittedAt_idx" ON "signatures"("shirtId", "submittedAt");

-- CreateIndex: ledger_entries
CREATE INDEX "ledger_entries_ownerId_createdAt_idx" ON "ledger_entries"("ownerId", "createdAt");
CREATE INDEX "ledger_entries_paymentId_idx" ON "ledger_entries"("paymentId");
CREATE INDEX "ledger_entries_withdrawalId_idx" ON "ledger_entries"("withdrawalId");

-- CreateIndex: withdrawals
CREATE INDEX "withdrawals_userId_status_idx" ON "withdrawals"("userId", "status");

-- AddForeignKey: sessions
ALTER TABLE "sessions"
    ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: accounts
ALTER TABLE "accounts"
    ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: departments
ALTER TABLE "departments"
    ADD CONSTRAINT "departments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: owner_profiles
ALTER TABLE "owner_profiles"
    ADD CONSTRAINT "owner_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "owner_profiles"
    ADD CONSTRAINT "owner_profiles_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "owner_profiles"
    ADD CONSTRAINT "owner_profiles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: bank_accounts
ALTER TABLE "bank_accounts"
    ADD CONSTRAINT "bank_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "owner_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: commission_acceptances
ALTER TABLE "commission_acceptances"
    ADD CONSTRAINT "commission_acceptances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "owner_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: student_verifications
ALTER TABLE "student_verifications"
    ADD CONSTRAINT "student_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "owner_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_verifications"
    ADD CONSTRAINT "student_verifications_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: verification_documents
ALTER TABLE "verification_documents"
    ADD CONSTRAINT "verification_documents_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "student_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: shirts
ALTER TABLE "shirts"
    ADD CONSTRAINT "shirts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owner_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shirts"
    ADD CONSTRAINT "shirts_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "shirt_model_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: payments
ALTER TABLE "payments"
    ADD CONSTRAINT "payments_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owner_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payments"
    ADD CONSTRAINT "payments_shirtId_fkey" FOREIGN KEY ("shirtId") REFERENCES "shirts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: payment_events
ALTER TABLE "payment_events"
    ADD CONSTRAINT "payment_events_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: signing_entitlements
ALTER TABLE "signing_entitlements"
    ADD CONSTRAINT "signing_entitlements_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signing_entitlements"
    ADD CONSTRAINT "signing_entitlements_shirtId_fkey" FOREIGN KEY ("shirtId") REFERENCES "shirts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: signatures
ALTER TABLE "signatures"
    ADD CONSTRAINT "signatures_shirtId_fkey" FOREIGN KEY ("shirtId") REFERENCES "shirts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signatures"
    ADD CONSTRAINT "signatures_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signatures"
    ADD CONSTRAINT "signatures_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "signing_entitlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: ledger_entries
ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_entries"
    ADD CONSTRAINT "ledger_entries_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "withdrawals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: withdrawals
ALTER TABLE "withdrawals"
    ADD CONSTRAINT "withdrawals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "owner_profiles"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

