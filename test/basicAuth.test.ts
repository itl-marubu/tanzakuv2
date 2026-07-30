import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/index";

// middleware/basicAuth.ts の fail-closed 挙動を検証する。
// /manage/session は DB を使わないため basicAuth 単体の確認に適している。

describe("adminBasicAuth (fail-closed)", () => {
  it("ADMIN_ID/ADMIN_PWD が未設定なら設定不備として500を返す", async () => {
    const res = await app.request(
      "/manage/session",
      {},
      { ...env, ADMIN_ID: "", ADMIN_PWD: "" }
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "ADMIN_ID/ADMIN_PWD is not configured"
    });
  });

  it("ADMIN_ID のみ未設定でも500を返す", async () => {
    const res = await app.request(
      "/manage/session",
      {},
      { ...env, ADMIN_ID: "" }
    );
    expect(res.status).toBe(500);
  });

  it("設定済みなら認証なしは401(従来通り)", async () => {
    const res = await app.request("/manage/session", {}, env);
    expect(res.status).toBe(401);
  });

  it("設定済みで正しい資格情報なら200(従来通り)", async () => {
    const authHeader = `Basic ${btoa("admin:password")}`;
    const res = await app.request(
      "/manage/session",
      { headers: { Authorization: authHeader } },
      env
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
