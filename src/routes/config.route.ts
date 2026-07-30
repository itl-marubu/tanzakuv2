import { Hono } from "hono";
import { ConfigService } from "../services/config.service";

const config = new Hono<{ Bindings: CloudflareBindings }>();

// 公開 API: 認証不要でフェスティバルモードを取得する
config.get("/", async (c) => {
  const service = new ConfigService(c.env.DB);
  const festivalMode = await service.getFestivalMode();

  return c.json({ festivalMode });
});

export default config;
