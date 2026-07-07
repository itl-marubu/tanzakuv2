import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 既存 D1 スキーマ(migrations/*.sql の DDL)の忠実な写像。
// マイグレーションは migrations/*.sql が正であり、このスキーマから DDL は生成しない。
// 認証関連テーブル(AdminUser / GoogleOauth / GitHubOauth / RefreshToken)は
// 未使用のため migrations/0006 で削除済み(このスキーマにも定義しない)。
//
// 注意点:
// - DATETIME 列の実体は TEXT。既存データは "YYYY-MM-DD HH:MM:SS"(CURRENT_TIMESTAMP/
//   シード由来)と ISO 8601(Prisma 書き込み由来)が混在しうるため text() で扱い、
//   読み書きは lib/dates.ts のヘルパーを必ず経由する
// - BOOLEAN 列の実体は INTEGER 0/1 → integer(mode: "boolean")
// - id / createdAt / updatedAt に DB デフォルトを持たない列はアプリ側で明示的に
//   値を与える(lib/id.ts / lib/dates.ts)

export const event = sqliteTable("Event", {
  // crypto.randomUUID() で生成
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: integer("isActive", { mode: "boolean" }).notNull().default(false),
  createdAt: text("createdAt").notNull()
});

export const tanzaku = sqliteTable("Tanzaku", {
  // crypto.randomUUID() で生成
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  userName: text("userName").notNull(),
  visiblePattern: integer("visiblePattern", { mode: "boolean" })
    .notNull()
    .default(true),
  // 0=適切(表示)、1=不適切(非表示)
  validationResult: integer("validationResult").notNull().default(0),
  logicalDelete: integer("logicalDelete", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("createdAt").notNull(),
  // null はレガシー(イベント制導入前)データ
  eventId: text("eventId").references(() => event.id)
});

export const appConfig = sqliteTable("AppConfig", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  // DDL に DEFAULT がないため insert/update 時に明示必須
  updatedAt: text("updatedAt").notNull()
});

export type EventRow = typeof event.$inferSelect;
export type TanzakuRow = typeof tanzaku.$inferSelect;
export type TanzakuInsert = typeof tanzaku.$inferInsert;
export type AppConfigRow = typeof appConfig.$inferSelect;
