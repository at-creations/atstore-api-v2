import { Router } from "express";
import {
  sendVerificationEmail,
  verifyEmail,
  sendResetPasswordEmail,
  resetPassword,
} from "../controllers/verify.controller";
import { sensitiveRateLimiter } from "../middleware/rate-limit.middleware";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.post(
  "/email/send",
  authenticate,
  sensitiveRateLimiter,
  sendVerificationEmail
);

router.get("/email/:token", sensitiveRateLimiter, verifyEmail);

router.post(
  "/password-reset/send",
  sensitiveRateLimiter,
  sendResetPasswordEmail
);

router.post("/password-reset/:token", sensitiveRateLimiter, resetPassword);

export default router;
