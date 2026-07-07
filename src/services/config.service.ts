import { createDb } from "../db/client";
import { nowForDb } from "../lib/dates";
import { ConfigRepository } from "../repositories/config.repository";

const FESTIVAL_MODE_KEY = "festivalMode";
// 未設定時のデフォルト値(現行の七夕運用に合わせる)
const DEFAULT_FESTIVAL_MODE = "tanabata";

export class ConfigService {
  private readonly configs: ConfigRepository;

  constructor(db: D1Database) {
    this.configs = new ConfigRepository(createDb(db));
  }

  async getFestivalMode(): Promise<string> {
    const row = await this.configs.findByKey(FESTIVAL_MODE_KEY);
    return row?.value ?? DEFAULT_FESTIVAL_MODE;
  }

  async setFestivalMode(value: string): Promise<string> {
    const saved = await this.configs.upsert({
      key: FESTIVAL_MODE_KEY,
      value,
      updatedAt: nowForDb()
    });
    return saved.value;
  }
}
