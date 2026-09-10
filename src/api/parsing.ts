import { z } from 'zod';

export class ValidationError extends Error {
  readonly validationLabel: string;
  constructor(validationLabel: string, message?: string) {
    super(message ? `${validationLabel}: ${message}` : `${validationLabel} returned invalid data.`);
    this.name = 'ValidationError';
    this.validationLabel = validationLabel;
  }
}

export const parseOrFallback = <T>(
  schema: z.ZodType<T>,
  data: unknown,
  fallback: unknown,
  validationLabel: string,
): T => {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`${validationLabel} validation failed:`, result.error);
    const fallbackResult = schema.safeParse(fallback);
    if (!fallbackResult.success) {
      throw new ValidationError(validationLabel, 'The server returned invalid data. Try again.');
    }
    return fallbackResult.data;
  }
  return result.data;
};

export const parseOrThrow = <T>(
  schema: z.ZodType<T>,
  data: unknown,
  validationLabel: string,
): T => {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`${validationLabel} validation failed:`, result.error);
    throw new ValidationError(validationLabel, 'The server returned invalid data. Try again.');
  }
  return result.data;
};

export const pageTokenFrom = (data: unknown): string | null => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const token = (data as Record<string, unknown>).next_page_token;
  if (token === null || token === undefined) return null;
  if (typeof token !== 'string') {
    console.error('next_page_token validation failed: expected string, received', typeof token);
    return null;
  }
  return token;
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
