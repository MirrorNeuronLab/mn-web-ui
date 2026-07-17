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
  preserveValidItems = false,
): T[] => {
  if (!preserveValidItems) {
    const result = z.array(schema).safeParse(data);
    if (!result.success) {
      console.error(`${validationLabel} validation failed:`, result.error);
      return [];
    }
    return result.data;
  }

  if (!Array.isArray(data)) {
    const result = z.array(schema).safeParse(data);
    console.error(`${validationLabel} validation failed:`, result.error);
    return [];
  }

  return data.flatMap((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) return [result.data];
    console.error(`${validationLabel}[${index}] validation failed:`, result.error);
    return [];
  });
};
