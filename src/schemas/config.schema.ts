import { z } from "zod";

// 管理 API: グローバル設定の更新(現状は festivalMode のみ)
export const updateConfigSchema = z.object({
  festivalMode: z.string().min(1).max(32)
});
