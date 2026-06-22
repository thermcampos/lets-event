-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('proposed', 'confirmed', 'declined', 'cancelled', 'completed');

-- AlterTable: add new columns
ALTER TABLE "Booking" ADD COLUMN "proposalMessage" TEXT;
ALTER TABLE "Booking" ADD COLUMN "respondedAt" TIMESTAMP(3);

-- AlterTable: convert status column from Text to BookingStatus enum
ALTER TABLE "Booking" ALTER COLUMN "status" TYPE "BookingStatus" USING "status"::"BookingStatus";
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'confirmed';

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");
