import type { MiddlewareHandler } from "hono";
import { basicAuth } from "hono/basic-auth";

/**
 * 管理 API 用 Basic 認証。資格情報は環境変数 ADMIN_ID / ADMIN_PWD。
 * fail-closed: どちらか未設定の場合はデフォルト値へフォールバックせず、
 * 設定不備として 500 を返す(誤って既定の資格情報が有効になることを防ぐ)。
 */
export const adminBasicAuth =
  (): MiddlewareHandler<{ Bindings: CloudflareBindings }> => (c, next) => {
    const { ADMIN_ID, ADMIN_PWD } = c.env;
    if (!ADMIN_ID || !ADMIN_PWD) {
      return Promise.resolve(
        c.json({ error: "ADMIN_ID/ADMIN_PWD is not configured" }, 500)
      );
    }
    const auth = basicAuth({
      username: ADMIN_ID,
      password: ADMIN_PWD
    });
    return auth(c, next);
  };
