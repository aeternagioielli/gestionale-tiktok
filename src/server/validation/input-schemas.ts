import { z } from "zod";
import { Source } from "@/generated/prisma/enums";

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);

export const orderInputSchema = z.object({
  externalId: z.string().trim().min(1).max(200).optional(),
  source: z.enum([Source.SHOPIFY, Source.MANUAL, Source.OTHER]).default(Source.OTHER),
  orderDate: z.coerce.date().optional(),
  totalAmount: z.number().nonnegative().optional(),
  currency: z.string().trim().length(3).toUpperCase().default("EUR"),
  customerId: z.string().trim().min(1).optional(),
});

export const productInputSchema = z.object({
  externalId: z.string().trim().min(1).max(200).optional(),
  source: z.enum([Source.SHOPIFY, Source.MANUAL, Source.OTHER]).default(Source.OTHER),
  name: nonEmptyText(200),
  sku: z.string().trim().max(100).optional(),
  description: z.string().trim().max(5000).optional(),
  price: z.number().nonnegative().optional(),
  currency: z.string().trim().length(3).toUpperCase().default("EUR"),
  category: z.string().trim().max(120).optional(),
  imageUrl: z.string().url().optional(),
});

export const goalInputSchema = z
  .object({
    name: nonEmptyText(160),
    currentValue: z.number().nonnegative().default(0),
    targetValue: z.number().positive(),
    unit: nonEmptyText(50),
    startDate: z.coerce.date(),
    targetDate: z.coerce.date().optional(),
  })
  .refine((value) => !value.targetDate || value.targetDate >= value.startDate, {
    message: "La data target non può precedere la data di inizio.",
    path: ["targetDate"],
  });

export const integrationConfigSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .refine(
    (config) => Object.keys(config).every((key) => !/(token|secret|password|api.?key)/i.test(key)),
    { message: "Token e segreti non possono essere salvati nella configurazione." },
  );

export function validateIntegrationConfig(config: unknown) {
  return integrationConfigSchema.parse(config);
}
