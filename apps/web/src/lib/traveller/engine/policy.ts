import { z } from 'zod';

export const weightSchema = z.object({ discount: z.number().int().min(0).max(100), percentile: z.number().int().min(0).max(100), quality: z.number().int().min(0).max(100), verification: z.number().int().min(0).max(100) }).strict()
  .refine(value => Object.values(value).reduce((sum, weight) => sum + weight, 0) === 100 && value.discount + value.percentile > 0, 'Weights must total 100 and include price evidence');
export const DEFAULT_WEIGHTS = { discount: 35, percentile: 30, quality: 20, verification: 15 };
export type ScoreWeights = z.output<typeof weightSchema>;
export const engineSchema = z.object({ baseCurrency: z.string().refine(value => Intl.supportedValuesOf('currency').includes(value)), weights: weightSchema }).strict();
export const DEFAULT_ENGINE = engineSchema.parse({ baseCurrency: 'EUR', weights: DEFAULT_WEIGHTS });
