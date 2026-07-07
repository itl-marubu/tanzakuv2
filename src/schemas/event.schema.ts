import { z } from "zod";

export const createEventSchema = z.object({
  name: z.string(),
  description: z.string().optional()
});
