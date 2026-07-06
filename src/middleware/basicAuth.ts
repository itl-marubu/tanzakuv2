import type { MiddlewareHandler } from "hono";
import { basicAuth } from "hono/basic-auth";

/**
 * 管理 API 用 Basic 認証。資格情報は環境変数 ADMIN_ID / ADMIN_PWD。
 * デフォルト値(admin/password)は現行互換のため残しているが、
 * 本番では必ず Secrets を設定すること。
 */
export const adminBasicAuth =
  (): MiddlewareHandler<{ Bindings: CloudflareBindings }> => (c, next) => {
    const auth = basicAuth({
      username: c.env.ADMIN_ID || "admin",
      password: c.env.ADMIN_PWD || "password"
    });
    return auth(c, next);
  };
