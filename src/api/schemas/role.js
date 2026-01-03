import { z } from 'zod';

export const RoleValue = z.enum([
  'admin',
  'manager',
  'staff',
  'faculty',
  'student',
  'customer',
]);

export const RoleSchema = z
  .object({
    label: z.string().min(1),
    value: RoleValue,
    description: z.string().min(1),
    permissions: z.array(z.string()).optional().default([]),
  })
  .passthrough();
