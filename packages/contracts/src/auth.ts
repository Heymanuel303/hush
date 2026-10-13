import { z } from 'zod';

export const LoginRequest = z.object({ email: z.email(), password: z.string().min(1).max(256) });
export type LoginRequest = z.infer<typeof LoginRequest>;

export const AdminInfo = z.object({ email: z.string() });
export type AdminInfo = z.infer<typeof AdminInfo>;

/** Public. */
export const SetupStatus = z.object({ adminConfigured: z.boolean() });
export type SetupStatus = z.infer<typeof SetupStatus>;

/** Admin only. */
export const HubStatus = z.object({
  piholeConnected: z.boolean(),
  profileCount: z.number().int().min(0),
  deviceCount: z.number().int().min(0),
});
export type HubStatus = z.infer<typeof HubStatus>;
