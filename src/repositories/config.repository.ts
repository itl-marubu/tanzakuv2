import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { type AppConfigRow, appConfig } from "../db/schema";

export class ConfigRepository {
  constructor(private readonly db: Db) {}

  async findByKey(key: string): Promise<AppConfigRow | null> {
    const rows = await this.db
      .select()
      .from(appConfig)
      .where(eq(appConfig.key, key))
      .limit(1);
    return rows[0] ?? null;
  }

  /** key が既存なら value/updatedAt を更新、なければ新規挿入する */
  async upsert(row: typeof appConfig.$inferInsert): Promise<AppConfigRow> {
    const [saved] = await this.db
      .insert(appConfig)
      .values(row)
      .onConflictDoUpdate({
        target: appConfig.key,
        set: { value: row.value, updatedAt: row.updatedAt }
      })
      .returning();
    return saved;
  }
}
