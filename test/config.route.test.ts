import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app from "../src/index";

// vitest.config.mts では ADMIN_ID / ADMIN_PWD 未設定のため
// middleware/basicAuth.ts のデフォルト値(admin/password)が使われる
const authHeader = `Basic ${btoa("admin:password")}`;

describe("GET /config", () => {
  it("認証なしで未設定時のデフォルト(tanabata)を返す", async () => {
    const res = await app.request("/config", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ festivalMode: "tanabata" });
  });
});

describe("PUT /manage/config", () => {
  it("認証なしは401", async () => {
    const res = await app.request(
      "/manage/config",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ festivalMode: "halloween" })
      },
      env
    );
    expect(res.status).toBe(401);
  });

  it("PUTで更新した値がGET /configで取得できる(ラウンドトリップ)", async () => {
    const putRes = await app.request(
      "/manage/config",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader
        },
        body: JSON.stringify({ festivalMode: "halloween" })
      },
      env
    );
    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toEqual({ success: true });

    const getRes = await app.request("/config", {}, env);
    expect(await getRes.json()).toEqual({ festivalMode: "halloween" });
  });

  it("festivalModeが空文字は400", async () => {
    const res = await app.request(
      "/manage/config",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader
        },
        body: JSON.stringify({ festivalMode: "" })
      },
      env
    );
    expect(res.status).toBe(400);
  });

  it("festivalModeが33文字は400", async () => {
    const res = await app.request(
      "/manage/config",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader
        },
        body: JSON.stringify({ festivalMode: "a".repeat(33) })
      },
      env
    );
    expect(res.status).toBe(400);
  });
});
