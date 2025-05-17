-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tanzaku" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "visiblePattern" BOOLEAN NOT NULL DEFAULT true,
    "validationResult" INTEGER NOT NULL DEFAULT 0,
    "logicalDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Tanzaku" ("content", "createdAt", "id", "userName", "visiblePattern") SELECT "content", "createdAt", "id", "userName", "visiblePattern" FROM "Tanzaku";
DROP TABLE "Tanzaku";
ALTER TABLE "new_Tanzaku" RENAME TO "Tanzaku";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
