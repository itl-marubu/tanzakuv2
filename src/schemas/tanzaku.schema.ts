import { z } from "zod";

// 公開 API: 短冊投稿
// content>14 は旧実装ではサービス層 throw による 500 だったが、
// zod バリデーションにより 400 を返す(フロントの挙動は同一・改善として許容)
export const createTanzakuSchema = z.object({
  content: z.string().max(14, "メッセージは14文字以内で入力してください"),
  userName: z.string()
});

// 管理 API: 短冊作成(AI 検証スキップ・validationResult / eventId 指定可)
export const manageCreateTanzakuSchema = z.object({
  content: z.string().max(14),
  userName: z.string(),
  validationResult: z.number().optional(),
  eventId: z.string().nullable().optional()
});

// 管理 API: 一括編集(delete=論理削除 / hardDelete=物理削除 / update=部分更新)
export const editTanzakuSchema = z.array(
  z.discriminatedUnion("operation", [
    z.object({
      id: z.string(),
      operation: z.literal("delete")
    }),
    z.object({
      id: z.string(),
      operation: z.literal("hardDelete")
    }),
    z.object({
      id: z.string(),
      operation: z.literal("update"),
      content: z.string().optional(),
      userName: z.string().optional(),
      validationResult: z.number().optional(),
      eventId: z.string().nullable().optional()
    })
  ])
);
