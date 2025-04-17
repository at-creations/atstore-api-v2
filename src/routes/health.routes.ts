import { Router } from "express";
import {
  getHealthStatus,
  getDetailedHealth,
} from "../controllers/health.controller";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();

// Public health check - accessible without authentication
router.get("/", getHealthStatus);

router.use(authenticate); 

// Detailed health check - only accessible to admins
router.get("/detailed", authorize(["admin"]), getDetailedHealth);

export default router;
