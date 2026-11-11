import type { ZodType } from "zod";

export class HttpError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		message: string,
		public readonly details?: unknown,
	) {
		super(message);
	}
}

export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
	const result = schema.safeParse(data);
	if (!result.success) {
		throw new HttpError(
			400,
			"VALIDATION_ERROR",
			"Invalid request.",
			result.error.issues.map(({ path, code, message }) => ({
				path,
				code,
				message,
			})),
		);
	}
	return result.data;
}

/* In your global error handler, make sure this exists:
   if (err instanceof HttpError) {
     return res.status(err.status).json({ success:false, error:{ code: err.code, message: err.message, details: err.details, requestId: req.id } });
   }
*/
