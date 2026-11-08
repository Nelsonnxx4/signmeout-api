import { z } from "zod";

export const createShirtSchema = z.object({
	shirtType: z.enum(["SHORT_SLEEVE", "LONG_SLEEVE"]),
});

// Owners can only change status. Everything else about a shirt is fixed at creation.
export const updateShirtSchema = z.object({
	status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]),
});
