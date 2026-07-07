import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client";
import { appConfig } from "../src/db/schema";
import { ConfigService } from "../src/services/config.service";

const db = createDb(env.DB);
const service = () => new ConfigService(env.DB);

describe("getFestivalMode", () => {
  it("未設定時は tanabata を返す", async () => {
    expect(await service().getFestivalMode()).toBe("tanabata");
  });

  it("設定済みの値を返す", async () => {
    await service().setFestivalMode("halloween");
    expect(await service().getFestivalMode()).toBe("halloween");
  });
});

describe("setFestivalMode", () => {
  it("行を新規作成する(updatedAt を明示設定)", async () => {
    await service().setFestivalMode("halloween");
    const rows = await db.select().from(appConfig);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe("festivalMode");
    expect(rows[0].value).toBe("halloween");
    expect(rows[0].updatedAt).toBeTruthy();
  });

  it("既存行を上書きする(行は増えない)", async () => {
    await service().setFestivalMode("halloween");
    await service().setFestivalMode("christmas");
    const rows = await db.select().from(appConfig);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe("christmas");
  });
});
