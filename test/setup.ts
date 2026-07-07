import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

// 各テストファイルの実行前に migrations/ を空の D1 に適用する。
// スキーマの正は本番と同一の SQL マイグレーション。
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// 手動 miniflare 構成ではテスト単位のストレージ分離が効かないため、
// 各テスト前に全テーブルを明示的にクリアする(FK の子→親の順)。
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM Tanzaku"),
    env.DB.prepare("DELETE FROM RefreshToken"),
    env.DB.prepare("DELETE FROM GoogleOauth"),
    env.DB.prepare("DELETE FROM GitHubOauth"),
    env.DB.prepare("DELETE FROM Event"),
    env.DB.prepare("DELETE FROM AdminUser")
  ]);
});
