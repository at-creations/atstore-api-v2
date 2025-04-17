import { Router } from "express";
import {
  changePassword,
  getMe,
  login,
  logout,
  refreshToken,
  register,
  registerByAdmin,
  updateProfile,
} from "../controllers/auth.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  authRateLimiter,
  sensitiveRateLimiter,
} from "../middleware/rate-limit.middleware";

const router = Router();

// Public auth endpoints with stricter rate limiting
router.post("/register", authRateLimiter, register);
router.post("/refresh", authRateLimiter, refreshToken);
router.post("/login", authRateLimiter, login);
router.post("/logout", authRateLimiter, logout);

// Protected routes - already behind authentication
router.use(authenticate);
router.post(
  "/admin/register",
  authorize(["admin"]),
  authRateLimiter,
  registerByAdmin
);
router.get("/profile", getMe);
router.post("/change-password", sensitiveRateLimiter, changePassword);
router.put("/profile", sensitiveRateLimiter, updateProfile);

export default router;
