-- Create Event table
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add eventId column to Tanzaku (nullable, existing rows will be NULL = legacy data)
ALTER TABLE "Tanzaku" ADD COLUMN "eventId" TEXT REFERENCES "Event"("id");
