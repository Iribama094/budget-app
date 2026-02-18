import { z } from 'zod';

export function parseWith<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  return schema.parse(input);
}

export const zEmail = z.string().email();
export const zPassword = z.string().min(8);
