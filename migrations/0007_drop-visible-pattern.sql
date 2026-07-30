-- Migration number: 0007 	 2026-07-07T21:58:25.391Z

-- 短冊表示ローテーションのステートレス再設計に伴い、消費型ローテーション用の
-- visiblePattern 列を廃止する。GET /tanzaku/client は書き込みゼロの決定的計算
-- (src/lib/rotation.ts)に置き換え済みで、このマイグレーション適用前から
-- 新コードは本列を非参照(列残存でも動作するのはそのため)。
-- ロールバックする場合は `ALTER TABLE "Tanzaku" ADD COLUMN "visiblePattern" BOOLEAN NOT NULL DEFAULT true;`
-- (消費状態は使い捨てのため復元不要)。
ALTER TABLE "Tanzaku" DROP COLUMN "visiblePattern";
