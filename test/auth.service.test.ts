import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { adminUser, googleOauth, refreshToken } from "../src/db/schema";
import { dateForDb } from "../src/lib/dates";
import { verifyToken } from "../src/lib/jwt";
import { AuthService } from "../src/services/auth.service";

const db = createDb(env.DB);
const service = () => new AuthService(env.DB);
const SECRET = env.JWT_SECRET;

describe("signup / login", () => {
  it("signup はユーザーを作成しトークン一式を返す", async () => {
    const tokens = await service().signup("a@example.com", "pass123", SECRET);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    const users = await db.select().from(adminUser);
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe("a@example.com");
    // パスワードは bcrypt ハッシュで保存される
    expect(users[0].password).toMatch(/^\$2[aby]\$/);
    // updatedAt は DEFAULT がないため明示的に埋まっている
    expect(users[0].updatedAt).toBeTruthy();

    // アクセストークンは既存の issuer/audience で検証できる
    const payload = await verifyToken(tokens.accessToken, SECRET);
    expect(payload.uid).toBe(users[0].id);
  });

  it("既存メールアドレスの signup は throw", async () => {
    await service().signup("a@example.com", "pass123", SECRET);
    await expect(
      service().signup("a@example.com", "other", SECRET)
    ).rejects.toThrow("User already exists");
  });

  it("login は正しいパスワードでトークンを返す", async () => {
    await service().signup("a@example.com", "pass123", SECRET);
    const tokens = await service().login("a@example.com", "pass123", SECRET);
    expect(tokens.accessToken).toBeTruthy();
  });

  it("login は誤ったパスワード・未知ユーザーで throw", async () => {
    await service().signup("a@example.com", "pass123", SECRET);
    await expect(
      service().login("a@example.com", "wrong", SECRET)
    ).rejects.toThrow("Invalid password");
    await expect(
      service().login("nobody@example.com", "pass123", SECRET)
    ).rejects.toThrow("User not found");
  });
});

describe("refreshToken", () => {
  it("有効なトークンで新しいトークン対を発行し、旧トークンを削除する", async () => {
    const first = await service().signup("a@example.com", "pass123", SECRET);
    const second = await service().refreshToken(first.refreshToken, SECRET);

    expect(second.refreshToken).not.toBe(first.refreshToken);

    const rows = await db.select().from(refreshToken);
    const tokens = rows.map((r) => r.token);
    expect(tokens).not.toContain(first.refreshToken);
    expect(tokens).toContain(second.refreshToken);
  });

  it("未知のトークンは throw", async () => {
    await expect(service().refreshToken("unknown", SECRET)).rejects.toThrow(
      "Invalid or expired refresh token"
    );
  });

  it("期限切れトークンは throw(TEXT 格納でも Date 比較が効く)", async () => {
    const tokens = await service().signup("a@example.com", "pass123", SECRET);
    const past = new Date();
    past.setDate(past.getDate() - 1);
    // 期限を過去に書き換える
    const rows = await db.select().from(refreshToken);
    await env.DB.prepare("UPDATE RefreshToken SET expiresAt = ? WHERE id = ?")
      .bind(dateForDb(past), rows[0].id)
      .run();

    await expect(
      service().refreshToken(tokens.refreshToken, SECRET)
    ).rejects.toThrow("Invalid or expired refresh token");
  });

  it("SQLite 形式(YYYY-MM-DD HH:MM:SS)の期限も正しく比較する", async () => {
    const tokens = await service().signup("a@example.com", "pass123", SECRET);
    const rows = await db.select().from(refreshToken);
    // 遠い将来(SQLite 形式)→ 有効のまま
    await env.DB.prepare("UPDATE RefreshToken SET expiresAt = ? WHERE id = ?")
      .bind("2099-01-01 00:00:00", rows[0].id)
      .run();
    const refreshed = await service().refreshToken(tokens.refreshToken, SECRET);
    expect(refreshed.accessToken).toBeTruthy();
  });
});

describe("handleGoogleAuth", () => {
  it("初回ログインで AdminUser と GoogleOauth(id=sub)を作成する", async () => {
    const tokens = await service().handleGoogleAuth(
      { id: "google-sub-123", email: "g@example.com" },
      SECRET
    );
    expect(tokens.accessToken).toBeTruthy();

    const oauths = await db.select().from(googleOauth);
    expect(oauths).toHaveLength(1);
    expect(oauths[0].id).toBe("google-sub-123");

    const users = await db.select().from(adminUser);
    expect(users).toHaveLength(1);
    expect(oauths[0].userId).toBe(users[0].id);
  });

  it("2回目以降のログインは既存ユーザーを使い二重登録しない", async () => {
    await service().handleGoogleAuth(
      { id: "google-sub-123", email: "g@example.com" },
      SECRET
    );
    await service().handleGoogleAuth(
      { id: "google-sub-123", email: "g@example.com" },
      SECRET
    );

    expect(await db.select().from(adminUser)).toHaveLength(1);
    expect(await db.select().from(googleOauth)).toHaveLength(1);
  });
});
