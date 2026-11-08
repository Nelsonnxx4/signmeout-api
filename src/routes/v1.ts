import { Router } from "express";
import { toNodeHandler } from "better-auth/node";

import { auth } from "../config/auth.js";
import { bankRouter } from "../modules/banks/bank.routes.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { onboardingRouter } from "../modules/onboarding/onboarding.routes.js";
import { paymentRouter } from "../modules/payments/payment.routes.js";
import { schoolRouter } from "../modules/schools/school.routes.js";
import { publicShirtRouter, shirtRouter } from "../modules/shirts/shirt.routes.js";
import { signatureRouter } from "../modules/signatures/signature.routes.js";
import { userRouter } from "../modules/users/user.routes.js";
import { verificationRouter } from "../modules/verification/verification.routes.js";
import { withdrawalRouter } from "../modules/withdrawals/withdrawal.routes.js";

export const v1Router = Router();

v1Router.use("/auth", toNodeHandler(auth));
v1Router.use("/health", healthRouter);
v1Router.use(userRouter);
v1Router.use(schoolRouter);
v1Router.use(onboardingRouter);
v1Router.use(bankRouter);
v1Router.use(shirtRouter);
v1Router.use(paymentRouter);
v1Router.use(signatureRouter);
v1Router.use(verificationRouter);
v1Router.use(withdrawalRouter);
v1Router.use(publicShirtRouter);

