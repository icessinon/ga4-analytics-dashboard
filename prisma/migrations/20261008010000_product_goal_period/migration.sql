-- AlterTable: 目標に対象の期（半期など）を持たせ、目標値の未設定を許す
ALTER TABLE "product_goals" ALTER COLUMN "target" DROP NOT NULL;
ALTER TABLE "product_goals" ADD COLUMN "periodStart" VARCHAR(7);
ALTER TABLE "product_goals" ADD COLUMN "periodEnd" VARCHAR(7);

-- 既存の目標は 2026 下半期のものなので初期値を入れる
UPDATE "product_goals" SET "periodStart" = '2026-07', "periodEnd" = '2026-12' WHERE "periodStart" IS NULL;
