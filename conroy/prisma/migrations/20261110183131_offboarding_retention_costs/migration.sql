-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UsageKind" ADD VALUE 'LLM_CACHE_READ_TOKENS';
ALTER TYPE "UsageKind" ADD VALUE 'LLM_CACHE_WRITE_TOKENS';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "customerRetentionMonths" INTEGER NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "CallLog" ADD COLUMN     "costUsdCents" DECIMAL(12,4);
