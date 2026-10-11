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
    console.error(`${validationLabel} returned invalid data.`);
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
    console.error(`${validationLabel} returned invalid data.`);
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
      console.error(`${validationLabel} returned invalid data.`);
      return [];
    }
    return result.data;
  }

  if (!Array.isArray(data)) {
    console.error(`${validationLabel} returned invalid data.`);
    return [];
  }

  return data.flatMap((item, index) => {
    const result = schema.safeParse(item);
    if (result.success) return [result.data];
    console.error(`${validationLabel}[${index}] returned invalid data.`);
    return [];
  });
};

export type Page<T> = { items: T[]; next_page_token: string | null };

export const parsePage = <T>(schema: z.ZodType<T>, data: unknown, label: string): Page<T> => (
  parseOrThrow(z.object({
    items: z.array(schema),
    next_page_token: z.string().min(1).nullable().optional().default(null),
  }), data, label)
);

/** Follow the API's opaque cursors without silently truncating a collection. */
export const collectPages = async <T>(
  load: (token?: string) => Promise<Page<T>>,
  label: string,
): Promise<Page<T>> => {
  const items: T[] = [];
  const seen = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const result = await load(token);
    items.push(...result.items);
    if (!result.next_page_token) return { items, next_page_token: null };
    if (seen.has(result.next_page_token)) throw new ValidationError(label, 'The server repeated a page token. Try again.');
    token = result.next_page_token;
    seen.add(token);
  }
  throw new ValidationError(label, 'The collection is too large to load. Narrow the selection and try again.');
};
