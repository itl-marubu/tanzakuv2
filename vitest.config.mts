import path from "node:path";
import {
  cloudflareTest,
  readD1Migrations
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  // 本番と同じ migrations/ を各テスト環境の D1 に適用する(test/setup.ts 参照)
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));

  return {
    plugins: [
      // wrangler.jsonc を直接参照すると AI バインディング(リモート実行必須)まで
      // 立ち上がってしまうため、テストに必要な D1 のみを手動定義する。
      // AI はサービス層へのインターフェース注入でモックする。
      cloudflareTest({
        miniflare: {
          compatibilityDate: "2025-05-13",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: { DB: "test-db" },
          bindings: {
            TEST_MIGRATIONS: migrations,
            ADMIN_ID: "admin",
            ADMIN_PWD: "password"
          }
        }
      })
    ],
    test: {
      setupFiles: ["./test/setup.ts"],
      deps: {
        optimizer: {
          ssr: {
            enabled: true,
            // CJS パッケージは workerd 上でそのまま require できないため
            // Vite に事前バンドルさせる
            include: ["@paralleldrive/cuid2", "bcryptjs"]
          }
        }
      }
    }
  };
});
