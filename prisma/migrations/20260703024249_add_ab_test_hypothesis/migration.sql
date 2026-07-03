-- AlterTable
ALTER TABLE "ab_tests" ADD COLUMN     "expectedImprovement" DECIMAL(8,2),
ADD COLUMN     "hypothesis" TEXT;
