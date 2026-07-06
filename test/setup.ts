import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// 各テストファイルの実行前に migrations/ を空の D1 に適用する。
// スキーマの正は本番と同一の SQL マイグレーション。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
