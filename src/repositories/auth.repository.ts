import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import {
  type AdminUserRow,
  type GoogleOauthRow,
  type RefreshTokenRow,
  adminUser,
  googleOauth,
  refreshToken
} from "../db/schema";
import { nowForDb } from "../lib/dates";
import { newUuid } from "../lib/id";

export class AdminUserRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<AdminUserRow | null> {
    const rows = await this.db
      .select()
      .from(adminUser)
      .where(eq(adminUser.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<AdminUserRow | null> {
    const rows = await this.db
      .select()
      .from(adminUser)
      .where(eq(adminUser.email, email))
      .limit(1);
    return rows[0] ?? null;
  }

  /** updatedAt は DDL に DEFAULT がないため常に明示する(旧 Prisma @updatedAt 相当) */
  async create(data: {
    email: string;
    password?: string | null;
  }): Promise<AdminUserRow> {
    const now = nowForDb();
    const [created] = await this.db
      .insert(adminUser)
      .values({
        id: newUuid(),
        email: data.email,
        password: data.password ?? null,
        createdAt: now,
        updatedAt: now
      })
      .returning();
    return created;
  }
}

export class GoogleOauthRepository {
  constructor(private readonly db: Db) {}

  /** id には Google の sub が入る */
  async findById(id: string): Promise<GoogleOauthRow | null> {
    const rows = await this.db
      .select()
      .from(googleOauth)
      .where(eq(googleOauth.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: {
    id: string;
    email: string;
    userId: string;
  }): Promise<GoogleOauthRow> {
    const now = nowForDb();
    const [created] = await this.db
      .insert(googleOauth)
      .values({ ...data, createdAt: now, updatedAt: now })
      .returning();
    return created;
  }
}

export class RefreshTokenRepository {
  constructor(private readonly db: Db) {}

  async findByToken(token: string): Promise<RefreshTokenRow | null> {
    const rows = await this.db
      .select()
      .from(refreshToken)
      .where(eq(refreshToken.token, token))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: {
    id: string;
    token: string;
    userId: string;
    expiresAt: string;
  }): Promise<RefreshTokenRow> {
    const now = nowForDb();
    const [created] = await this.db
      .insert(refreshToken)
      .values({ ...data, createdAt: now, updatedAt: now })
      .returning();
    return created;
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(refreshToken).where(eq(refreshToken.id, id));
  }
}
