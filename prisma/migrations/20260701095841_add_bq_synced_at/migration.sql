-- AlterTable
ALTER TABLE "ab_test_results" ADD COLUMN     "bqSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "funnel_executions" ADD COLUMN     "bqSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "report_executions" ADD COLUMN     "bqSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ab_test_results_bqSyncedAt_idx" ON "ab_test_results"("bqSyncedAt");

-- CreateIndex
CREATE INDEX "funnel_executions_bqSyncedAt_idx" ON "funnel_executions"("bqSyncedAt");

-- CreateIndex
CREATE INDEX "report_executions_bqSyncedAt_idx" ON "report_executions"("bqSyncedAt");
