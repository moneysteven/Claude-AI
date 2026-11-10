-- AlterEnum
ALTER TYPE "UsageKind" ADD VALUE 'TELEPHONY_SECONDS';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "goLiveAt" TIMESTAMP(3),
ADD COLUMN     "internalNotes" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PlanDefinition" (
    "code" "Plan" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPriceCents" INTEGER NOT NULL,
    "includedVoiceMinutes" INTEGER NOT NULL,
    "voiceOveragePerMinuteCents" INTEGER NOT NULL,
    "includedWhatsAppMessages" INTEGER NOT NULL,
    "whatsappOveragePerMsgCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanDefinition_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "UsageAlert" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageAlert_businessId_period_metric_threshold_key" ON "UsageAlert"("businessId", "period", "metric", "threshold");

-- AddForeignKey
ALTER TABLE "UsageAlert" ADD CONSTRAINT "UsageAlert_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
