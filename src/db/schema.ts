import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// 既存 D1 スキーマ(migrations/0001〜0004 の DDL)の忠実な写像。
// マイグレーションは migrations/*.sql が正であり、このスキーマから DDL は生成しない。
//
// 注意点:
// - DATETIME 列の実体は TEXT。既存データは "YYYY-MM-DD HH:MM:SS"(CURRENT_TIMESTAMP/
//   シード由来)と ISO 8601(Prisma 書き込み由来)が混在しうるため text() で扱い、
//   読み書きは lib/dates.ts のヘルパーを必ず経由する
// - BOOLEAN 列の実体は INTEGER 0/1 → integer(mode: "boolean")
// - id / createdAt / updatedAt に DB デフォルトを持たない列はアプリ側で明示的に
//   値を与える(lib/id.ts / lib/dates.ts)

export const adminUser = sqliteTable("AdminUser", {
  // crypto.randomUUID() で生成
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password"),
  createdAt: text("createdAt").notNull(),
  // DDL に DEFAULT がないため insert/update 時に明示必須
  updatedAt: text("updatedAt").notNull()
});

export const googleOauth = sqliteTable("GoogleOauth", {
  // Google の sub(ユーザーID)をそのまま主キーに使う(生成しない)。
  // 変えると既存ユーザーの再ログインが二重登録になる
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  userId: text("userId")
    .notNull()
    .unique()
    .references(() => adminUser.id),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull()
});

export const gitHubOauth = sqliteTable("GitHubOauth", {
  // INTEGER PRIMARY KEY AUTOINCREMENT(DB 任せ)
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  userId: text("userId")
    .notNull()
    .unique()
    .references(() => adminUser.id),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull()
});

export const refreshToken = sqliteTable("RefreshToken", {
  // cuid2 で生成
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  // 期限比較は必ず parseDbDate() で Date 化してから行う(TEXT の字句比較は不可)
  expiresAt: text("expiresAt").notNull(),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => adminUser.id)
});

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

export type AdminUserRow = typeof adminUser.$inferSelect;
export type GoogleOauthRow = typeof googleOauth.$inferSelect;
export type RefreshTokenRow = typeof refreshToken.$inferSelect;
export type EventRow = typeof event.$inferSelect;
export type TanzakuRow = typeof tanzaku.$inferSelect;
export type TanzakuInsert = typeof tanzaku.$inferInsert;
