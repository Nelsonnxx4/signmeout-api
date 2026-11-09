CREATE TYPE "VerificationDocumentType" AS ENUM ('STUDENT_ID', 'ADMISSION_LETTER');

ALTER TABLE "student_verifications"
ADD COLUMN "fullName" TEXT,
ADD COLUMN "admissionNumber" TEXT,
ADD COLUMN "nickname" TEXT;

ALTER TABLE "verification_documents"
ADD COLUMN "documentType" "VerificationDocumentType";
