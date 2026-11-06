import { z } from "zod";

export const PROFILE_LABEL_MAX_LENGTH = 64;

const profileBaseSchema = z.object({
  id: z.string().min(1),
  serverUrl: z.string().url(),
  label: z.string().min(1).max(PROFILE_LABEL_MAX_LENGTH),
  createdAt: z.number().int().nonnegative(),
});

export const directServerProfileSchema = profileBaseSchema
  .extend({ mode: z.literal("direct") })
  .strict();

const retiredConnectServerProfileSchema = profileBaseSchema
  .extend({
    mode: z.literal("connect"),
    handle: z.string().min(1),
    credential: z.string().min(1),
  })
  .strict();

export const serverProfileSchema = z.discriminatedUnion("mode", [
  directServerProfileSchema,
  retiredConnectServerProfileSchema,
]);

export type DirectServerProfile = z.infer<typeof directServerProfileSchema>;
export type RetiredConnectServerProfile = z.infer<
  typeof retiredConnectServerProfileSchema
>;
export type ServerProfile = z.infer<typeof serverProfileSchema>;
export type NewServerProfile = Omit<DirectServerProfile, "id" | "createdAt">;

export type ServerProfilePatch = Partial<
  Pick<DirectServerProfile, "label" | "serverUrl">
>;
