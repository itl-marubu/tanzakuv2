import { createId } from "@paralleldrive/cuid2";

// ID 生成規約(既存データとの互換):
//   Tanzaku / Event / AdminUser … UUID(旧 Prisma @default(uuid()))
//   RefreshToken.id / token     … cuid2(旧 Prisma @default(cuid()) / createId())
//   GoogleOauth.id              … Google の sub をそのまま(生成しない)
//   GitHubOauth.id              … INTEGER AUTOINCREMENT(DB 任せ)

export const newUuid = (): string => crypto.randomUUID();

export const newCuid = (): string => createId();
