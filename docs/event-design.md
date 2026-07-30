# イベント管理機能 設計案

> **本書は実装前の設計案（アーカイブ）です。** 記載のスキーマ定義は Prisma 時代のもので、
> 現在の実装とは表記が異なります。現行仕様は以下を参照してください。
>
> - スキーマ: `docs/ERD.md` / `src/db/schema.ts`（Drizzle）/ `migrations/0004_event.sql`
> - API: `docs/openapi.yml`
> - システム全体: `docs/system-overview.md`
>
> 「推奨案（Event テーブル）」はそのまま採用され、`GET/POST /manage/events`、
> `POST /manage/events/:id/activate` に加えて `POST /manage/events/deactivate-all` が実装済みです。
> 既存データは `eventId = null`（レガシー扱い）のまま運用しています。

## 概要

今後の複数イベント対応に向けて、既存の短冊データをアーカイブし、
イベント単位で短冊を管理できる仕組みを追加する。

---

## スキーマ変更

```prisma
model Event {
  id          String    @id @default(uuid())
  name        String        // "七夕2024", "七夕2025" など
  description String?
  isActive    Boolean   @default(false)  // アクティブなイベントは1件のみ
  createdAt   DateTime  @default(now())
  tanzakus    Tanzaku[]
}

model Tanzaku {
  // ...既存フィールド...
  eventId     String?           // FK → Event.id (nullable: 既存データはnullのまま)
  event       Event?  @relation(fields: [eventId], references: [id])
}
```

---

## 動作

| 場面 | 挙動 |
|---|---|
| 短冊投稿 (`POST /tanzaku/`) | アクティブなイベントの `eventId` を自動付与 |
| クライアント表示 (`GET /tanzaku/client`) | アクティブなイベントの短冊のみ返す |
| 管理画面 | イベント作成・切り替え・イベント別一覧表示 |
| 既存データ | `eventId = null`（アーカイブ扱い）またはレトロアクティブに旧イベントを作成して紐付け |

---

## 管理画面の追加操作

```
GET  /manage/events               イベント一覧
POST /manage/events               新規作成
POST /manage/events/:id/activate  アクティブ切り替え（他は自動的に false へ）
```

管理画面のタブに「イベント管理」セクションを追加し、
短冊一覧にイベントフィルタを追加する。

---

## 他の案との比較

| 案 | メリット | デメリット |
|---|---|---|
| **Event テーブル (推奨)** | イベント名・説明が管理できる。過去イベントも閲覧可能 | 若干のスキーマ変更が必要 |
| Tanzaku に `eventTag` 文字列フィールドだけ追加 | シンプル | イベントのメタ情報が管理しにくい |
| 別テーブルにアーカイブ | 分離が明確 | クエリが複雑、コードが増える |

---

## マイグレーション方針

1. `Event` テーブルを追加（新規マイグレーション）
2. `Tanzaku.eventId` を nullable で追加
3. 管理画面から「旧イベント（アーカイブ）」を作成し、既存データを一括紐付け
   → または `eventId = null` のままアーカイブ扱いにする（よりシンプル）

---

## 検討事項

- 複数イベントを同時並行して使う可能性はあるか？（現状は isActive=true が1件のみの想定）
- `eventId = null` の既存データをどう扱うか（アーカイブ表示するか、完全に非表示にするか）
