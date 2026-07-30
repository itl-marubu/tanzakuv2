// 短冊表示ローテーションの純粋関数群。DB アクセス・時刻取得を含まない決定的計算のみ。
// GET /tanzaku/client はこれらを組み合わせて「書き込みゼロ」で毎回のバッチを算出する。

/** 新着セグメントの判定窓(ms): 直近この時間内に作成された短冊を新着として扱う */
export const FRESH_WINDOW_MS = 60_000;

/**
 * 新着セグメントに割り当てる予約枠数。
 * 新着セグメントの最大件数は `limit - FRESH_RESERVED_SLOTS`(下限 0)。
 * 連続投稿があっても巡回セグメントに最低 1 枠(limit>=3 の場合)を残すための予約。
 */
export const FRESH_RESERVED_SLOTS = 2;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a (32bit) ハッシュ。Math.imul で 32bit 整数乗算のオーバーフローを安全に扱う。
 * 戻り値は 0〜2^32-1 の非負整数(>>> 0 による符号なし化)。
 */
export const hashSeed = (seed: string): number => {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
};

/**
 * window/seed 未指定時、サーバー壁時計から window index を導出する
 * (カーソル未対応の旧フロント互換のデフォルト挙動)。
 */
export const windowIndexFromClock = (
  now: Date,
  intervalMs: number = FRESH_WINDOW_MS
): number => Math.floor(now.getTime() / intervalMs);

/**
 * 巡回プール(createdAt ASC, id ASC で安定順序を持つ配列)上の読み出し開始オフセットを算出する。
 * window が 1 進むごとに slotsPerWindow 件分進み、seed のハッシュで初期位相をずらす。
 * poolCount<=0 の場合は 0 を返す(呼び出し側でプール0件として空扱いにすること)。
 */
export const rotationOffset = (
  window: number,
  seedHash: number,
  slotsPerWindow: number,
  poolCount: number
): number => {
  if (poolCount <= 0) return 0;
  const raw = window * slotsPerWindow + seedHash;
  // JS の % は被除数が負のときに負を返すため、poolCount を足してから mod する
  return ((raw % poolCount) + poolCount) % poolCount;
};

export type WindowPart = { offset: number; limit: number };

/**
 * 環状の巡回プール(0-indexed, 全 poolCount 件)から offset を起点に limit 件を読み出すための
 * ASC 範囲(最大2つ)を算出する。末尾に達したら先頭へラップする。
 * - limit が poolCount を超える場合は poolCount に clamp する(重複読み出しを防ぐ)
 * - poolCount<=0 または limit<=0 のときは空配列
 */
export const splitWindow = (
  offset: number,
  limit: number,
  poolCount: number
): WindowPart[] => {
  if (poolCount <= 0 || limit <= 0) return [];

  const normalizedOffset = ((offset % poolCount) + poolCount) % poolCount;
  const clampedLimit = Math.min(limit, poolCount);

  const firstLimit = Math.min(clampedLimit, poolCount - normalizedOffset);
  const parts: WindowPart[] = [{ offset: normalizedOffset, limit: firstLimit }];

  const remaining = clampedLimit - firstLimit;
  if (remaining > 0) {
    parts.push({ offset: 0, limit: remaining });
  }

  return parts;
};
