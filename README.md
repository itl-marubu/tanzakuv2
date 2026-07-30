# tanzakuv2

iTL七夕祭 短冊アプリのバックエンド API。

## 技術スタック

- [Hono](https://hono.dev/) — Cloudflare Workers 上の HTTP フレームワーク
- [Drizzle ORM](https://orm.drizzle.team/)(drizzle-orm/d1) — Cloudflare D1(SQLite)
- [Zod](https://zod.dev/) + @hono/zod-validator — リクエストバリデーション
- [Vitest](https://vitest.dev/) + @cloudflare/vitest-pool-workers — workerd 上で動くテスト

## アーキテクチャ

```
src/
├── index.ts                  # アプリ組み立て(CORS・ルート登録のみ)
├── db/
│   ├── schema.ts             # Drizzle スキーマ(migrations/*.sql の写像。DDL は生成しない)
│   └── client.ts             # createDb(d1)
├── middleware/basicAuth.ts   # 管理 API 用 Basic 認証(ADMIN_ID / ADMIN_PWD、未設定時は500)
├── routes/                   # HTTP 層(zod バリデーション・ステータス変換)
│   ├── tanzaku.route.ts      # 公開 API
│   └── manage.route.ts       # 管理 JSON API(UI はフロントの /admin)
├── schemas/                  # zod スキーマ
├── services/                 # ビジネスロジック
│   ├── tanzaku.service.ts    # 投稿・表示ローテーション・一括編集
│   ├── moderation.service.ts # Workers AI による適切性検証(注入可能)
│   └── event.service.ts      # イベント管理(排他的アクティブ化)
├── repositories/             # DB アクセス層
└── lib/                      # 日時変換 / ID 生成
```

### DB の日時・ID の取り決め

- DATETIME 列の実体は TEXT。既存データは `YYYY-MM-DD HH:MM:SS`(UTC)と ISO 8601 が
  混在しうるため、読み取りは `lib/dates.ts` の `parseDbDate()`(両対応)、
  書き込みは ISO 8601(Z)に統一している
- ID: Tanzaku / Event = UUID

## 開発

```sh
pnpm install
pnpm migrate:dev   # ローカル D1 にマイグレーション適用
pnpm dev           # wrangler dev
```

```sh
pnpm test          # vitest(workerd 上で実行・D1 はテスト毎にクリア)
pnpm type-check
pnpm check         # biome lint + format
pnpm gen           # wrangler types(CloudflareBindings 再生成)
```

## API

`docs/openapi.yml` が正本。フロントエンド(tanzaku-frontend-v2)の型生成もこのファイルから行う。

管理 API(`/manage/*`)は Basic 認証(`ADMIN_ID` / `ADMIN_PWD`)。
管理画面 UI はフロントエンドの `/admin` に移設済みで、`GET /manage` はそこへリダイレクトする。

## デプロイ

GitHub Actions の `Deploy & Release`(workflow_dispatch)から実行。
`with_d1` を有効にすると `wrangler d1 migrations apply --remote DB` も実行される。

```sh
pnpm deploy        # 手動デプロイ(wrangler deploy --minify)
```

### 必要な Secrets

| 名前 | 用途 |
|---|---|
| `FRONTEND_BASEURL` | フロントエンド URL(/manage リダイレクト先) |
| `ADMIN_ID` / `ADMIN_PWD` | 管理 API の Basic 認証(未設定の場合、管理 API は 500 を返す) |
