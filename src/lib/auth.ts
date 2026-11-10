import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { dash } from "@better-auth/infra";
import { Resend } from "resend";

const client = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
	database: prismaAdapter(client, { provider: "postgresql" }),
	baseURL: "http://localhost:5000/",
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
		},
	},
	plugins: [
		emailOTP({
			otpLength: 6,
			expiresIn: 300, // 5 minutes
			sendVerificationOTP: async ({ email, otp, type }) => {
				// Send email using Resend
				await resend.emails.send({
					from: "onboarding@resend.dev", // Replace with your verified domain/sender
					to: email,
					subject: "Your Sign-In Code",
					html: `<p>Your verification code is: <strong>${otp}</strong></p>`,
				});
			},
		}),
		dash({
			apiKey: process.env.BETTER_AUTH_API_KEY!,
		}),
	],
});
