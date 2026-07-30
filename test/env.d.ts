/// <reference types="@cloudflare/vitest-pool-workers/types" />

// テスト専用バインディング(vitest.config.ts の miniflare.bindings で注入)を
// wrangler 生成の Cloudflare.Env へ宣言マージで追加する。
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    ADMIN_ID: string;
    ADMIN_PWD: string;
  }
}
