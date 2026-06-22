-- CreateEnum (idempotent)
DO $$ BEGIN
    CREATE TYPE "BookingStatus" AS ENUM ('proposed', 'confirmed', 'declined', 'cancelled', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable: add new columns
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "proposalMessage" TEXT;
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "respondedAt" TIMESTAMP(3);

-- AlterTable: convert status column from Text to BookingStatus enum
ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "BookingStatus" USING "status"::"BookingStatus";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'confirmed'::"BookingStatus";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Booking_status_idx" ON "Booking"("status");
