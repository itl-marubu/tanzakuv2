import { z } from "zod";

// 旧実装は任意 JSON を受けてサービス層で失敗していたため、
// 過度に厳しくしない(email 形式チェックはしない)
export const credentialsSchema = z.object({
  email: z.string(),
  password: z.string()
});

export const refreshSchema = z.object({
  refreshToken: z.string()
});
