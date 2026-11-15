-- CreateTable
CREATE TABLE "city_change" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "city_change_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "city_change_userId_changedAt_idx" ON "city_change"("userId", "changedAt");

-- AddForeignKey
ALTER TABLE "city_change" ADD CONSTRAINT "city_change_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
