-- CreateTable
CREATE TABLE "alert_configs" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dropThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "minSessions" INTEGER NOT NULL DEFAULT 100,
    "minCv" INTEGER NOT NULL DEFAULT 5,
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_configs_productId_key" ON "alert_configs"("productId");

-- AddForeignKey
ALTER TABLE "alert_configs" ADD CONSTRAINT "alert_configs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
