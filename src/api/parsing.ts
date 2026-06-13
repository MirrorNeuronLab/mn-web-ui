import { z } from 'zod';

export const parseOrFallback = <T>(
  schema: z.ZodType<T>,
  data: unknown,
  fallback: unknown,
  validationLabel: string,
): T => {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`${validationLabel} validation failed:`, result.error);
    return schema.parse(fallback);
  }
  return result.data;
};

export const parseArrayOrEmpty = <T>(
  schema: z.ZodType<T>,
  data: unknown,
  validationLabel: string,
): T[] => {
  const result = z.array(schema).safeParse(data);
  if (!result.success) {
    console.error(`${validationLabel} validation failed:`, result.error);
    return [];
  }
  return result.data;
};
