// D1 の DATETIME 列(実体 TEXT)の読み書きヘルパー。
//
// 既存データには2形式が混在しうる:
//   - "YYYY-MM-DD HH:MM:SS"      … SQLite の CURRENT_TIMESTAMP / SQL シード由来(UTC)
//   - ISO 8601("Z" / "±hh:mm")  … Prisma 書き込み由来
//
// 書き込みは Prisma と同じ ISO 8601(Z)に統一する。ORDER BY createdAt は
// テキスト比較のため、秒精度で同時刻でない限り両形式間でも順序は保たれる。
// 期限判定などの比較は必ず parseDbDate() で Date 化してから行うこと。

const SQLITE_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/** DB に格納された日時文字列を Date にする(両形式対応・UTC 扱い) */
export const parseDbDate = (value: string): Date => {
  if (SQLITE_DATETIME_RE.test(value)) {
    return new Date(`${value.replace(" ", "T")}Z`);
  }
  return new Date(value);
};

/** API レスポンス用: DB 日時文字列 → ISO 8601(Z)。旧 Prisma + c.json の出力と同形式 */
export const toApiDate = (value: string): string =>
  parseDbDate(value).toISOString();

/** DB 書き込み用の現在時刻(ISO 8601 Z) */
export const nowForDb = (): string => new Date().toISOString();

/** DB 書き込み用: Date → 格納形式(ISO 8601 Z) */
export const dateForDb = (date: Date): string => date.toISOString();
