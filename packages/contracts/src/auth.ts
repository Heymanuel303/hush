import { z } from 'zod';

export const AdminInfo = z.object({ email: z.string() });
export type AdminInfo = z.infer<typeof AdminInfo>;

/** `POST /api/auth/logout`: where the browser goes next, the idp's end-session URL. */
export const LogoutResponse = z.object({ location: z.string() });
export type LogoutResponse = z.infer<typeof LogoutResponse>;

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
