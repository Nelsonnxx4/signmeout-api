-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "commission_policies" (
    "id" UUID NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "platformBasisPoints" INTEGER NOT NULL,
    "ownerBasisPoints" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "commission_policies_platform_basis_points_check"
        CHECK ("platformBasisPoints" BETWEEN 0 AND 10000),
    CONSTRAINT "commission_policies_owner_basis_points_check"
        CHECK ("ownerBasisPoints" BETWEEN 0 AND 10000),
    CONSTRAINT "commission_policies_total_basis_points_check"
        CHECK ("platformBasisPoints" + "ownerBasisPoints" = 10000),
    CONSTRAINT "commission_policies_dates_check"
        CHECK ("retiredAt" IS NULL OR "retiredAt" > "effectiveAt")
);

-- CreateIndex
CREATE UNIQUE INDEX "commission_policies_version_key"
    ON "commission_policies"("version");

-- CreateIndex
CREATE INDEX "commission_policies_effectiveAt_idx"
    ON "commission_policies"("effectiveAt");

