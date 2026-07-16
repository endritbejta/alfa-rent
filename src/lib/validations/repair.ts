import { z } from "zod";

export const repairSchema = z.object({
  date: z.coerce.date(),
  cost: z.coerce
    .number()
    .positive("Cost must be greater than zero")
    .max(100000),
  description: z.string().trim().min(3, "Describe the repair").max(200),
  notes: z.string().trim().max(1000).optional(),
  reference: z.string().trim().max(60).optional(),
});

export type RepairInput = z.infer<typeof repairSchema>;
