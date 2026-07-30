// ID 生成規約(既存データとの互換):
//   Tanzaku / Event … UUID(旧 Prisma @default(uuid()))

export const newUuid = (): string => crypto.randomUUID();
