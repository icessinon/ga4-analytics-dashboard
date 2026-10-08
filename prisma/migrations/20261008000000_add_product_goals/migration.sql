-- CreateTable
CREATE TABLE "product_goals" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "metricKey" VARCHAR(40) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "note" TEXT,
    "target" DOUBLE PRECISION NOT NULL,
    "weight" INTEGER,
    "milestones" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_goals_productId_sortOrder_idx" ON "product_goals"("productId", "sortOrder");

-- AddForeignKey
ALTER TABLE "product_goals" ADD CONSTRAINT "product_goals_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
