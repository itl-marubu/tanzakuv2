import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { adminBasicAuth } from "../middleware/basicAuth";
import { createEventSchema } from "../schemas/event.schema";
import {
  editTanzakuSchema,
  manageCreateTanzakuSchema
} from "../schemas/tanzaku.schema";
import { EventService } from "../services/event.service";
import { TanzakuService } from "../services/tanzaku.service";

const manage = new Hono<{ Bindings: CloudflareBindings }>();

// 旧管理画面(インライン HTML)はフロントエンドの /admin へ移設済み。
// ブックマーク互換のため GET /manage はフロントへリダイレクトする(認証不要)。
manage.get("/", (c) => {
  return c.redirect(`${c.env.FRONTEND_BASEURL}/admin`, 302);
});

// これ以降の管理 API は全て Basic 認証
manage.use("*", adminBasicAuth());

// フロント管理画面のログインフォームが資格情報の疎通確認に使う。
// 認証ミドルウェアを通過した時点で資格情報は有効。
manage.get("/session", (c) => {
  return c.json({ ok: true });
});

manage.get("/tanzakus", async (c) => {
  const service = new TanzakuService(c.env.DB);
  try {
    const result = await service.getAllTanzaku();
    return c.json(result);
  } catch (error) {
    console.error("Failed to get tanzakus:", error);
    return c.json({ error: "Failed to get tanzakus" }, 500);
  }
});

manage.post(
  "/tanzakus/create",
  zValidator("json", manageCreateTanzakuSchema),
  async (c) => {
    const service = new TanzakuService(c.env.DB);
    try {
      const data = c.req.valid("json");

      // AI 検証はスキップ(管理者操作)。バリデーション結果未指定は 0(適切)
      const validationResult = data.validationResult ?? 0;

      const result = await service.createTanzaku(
        { content: data.content, userName: data.userName },
        null
      );

      // 作成は2段階: createTanzaku はアクティブイベントへ紐付けるため、
      // validationResult / eventId の明示指定があれば editTanzaku で上書きする
      // (eventId 未指定=アクティブイベント、明示 null=レガシー の意味差を維持)
      if (data.validationResult !== undefined || data.eventId !== undefined) {
        await service.editTanzaku([
          {
            id: result.id,
            operation: "update",
            validationResult,
            eventId: data.eventId
          }
        ]);
      }

      return c.json({ success: true, id: result.id });
    } catch (error) {
      console.error("Failed to create tanzaku:", error);
      return c.json({ error: "Failed to create tanzaku" }, 500);
    }
  }
);

manage.post("/tanzakus", zValidator("json", editTanzakuSchema), async (c) => {
  const service = new TanzakuService(c.env.DB);
  try {
    const requestData = c.req.valid("json");
    await service.editTanzaku(requestData);
    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to edit tanzakus:", error);
    return c.json({ error: "Failed to edit tanzakus" }, 500);
  }
});

manage.get("/events", async (c) => {
  const service = new EventService(c.env.DB);
  try {
    const events = await service.getAllEvents();
    return c.json(events);
  } catch (error) {
    console.error("Failed to get events:", error);
    return c.json({ error: "Failed to get events" }, 500);
  }
});

manage.post("/events", zValidator("json", createEventSchema), async (c) => {
  const service = new EventService(c.env.DB);
  try {
    const data = c.req.valid("json");
    const event = await service.createEvent(data);
    return c.json({ success: true, id: event.id });
  } catch (error) {
    console.error("Failed to create event:", error);
    return c.json({ error: "Failed to create event" }, 500);
  }
});

// 静的ルートを :id より先に登録
manage.post("/events/deactivate-all", async (c) => {
  const service = new EventService(c.env.DB);
  try {
    await service.deactivateAll();
    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to deactivate events:", error);
    return c.json({ error: "Failed to deactivate events" }, 500);
  }
});

manage.post("/events/:id/activate", async (c) => {
  const service = new EventService(c.env.DB);
  try {
    const { id } = c.req.param();
    await service.activateEvent(id);
    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to activate event:", error);
    return c.json({ error: "Failed to activate event" }, 500);
  }
});

export default manage;
