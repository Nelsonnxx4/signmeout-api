import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../config/auth.js";

export type AuthSession = NonNullable<
	Awaited<ReturnType<typeof auth.api.getSession>>
>;

declare global {
	namespace Express {
		interface Request {
			auth?: AuthSession;
		}
	}
}

export {};

function deny(
	req: Request,
	res: Response,
	status: 401 | 403,
	code: string,
	message: string,
) {
	// ADAPT: use your existing error helper/shape and request-id field if it differs.
	res
		.status(status)
		.json({ success: false, error: { code, message, requestId: req.id } });
}

export async function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const session = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});
		if (!session)
			return deny(req, res, 401, "UNAUTHENTICATED", "Authentication required.");
		req.auth = session;
		next();
	} catch (err) {
		next(err);
	}
}

export function requireRole(...roles: string[]) {
	return (req: Request, res: Response, next: NextFunction) => {
		const role = (req.auth?.user as { role?: string } | undefined)?.role;
		if (!role || !roles.includes(role)) {
			return deny(
				req,
				res,
				403,
				"FORBIDDEN",
				"You do not have access to this resource.",
			);
		}
		next();
	};
}

/** Use after requireAuth. */
export const requireAdmin = requireRole("ADMIN");
