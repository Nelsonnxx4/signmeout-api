CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "resourceType" VARCHAR(100) NOT NULL,
    "resourceId" VARCHAR(255),
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_audit_logs_adminUserId_createdAt_idx"
ON "admin_audit_logs"("adminUserId", "createdAt");

CREATE INDEX "admin_audit_logs_resourceType_resourceId_idx"
ON "admin_audit_logs"("resourceType", "resourceId");

ALTER TABLE "admin_audit_logs"
ADD CONSTRAINT "admin_audit_logs_adminUserId_fkey"
FOREIGN KEY ("adminUserId") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
