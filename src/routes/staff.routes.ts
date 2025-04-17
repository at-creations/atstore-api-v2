import { Router } from "express";
import {
  authenticate,
  authorize,
  requireVerified,
} from "../middleware/auth.middleware";
import {
  getUsers,
  disableUser,
  enableUser,
  deleteUser,
  changeRole,
  getUser,
  updateUser,
} from "../controllers/staff.controller";

const router = Router();

// Protected routes (only accessible to admin)
router.use(authenticate, authorize(["admin"]));

// User listing routes
router.get("/", getUsers);
router.get("/:id", getUser);

// User management routes
router.use(requireVerified); // Ensure user has verified their email
router.put("/:id/disable", disableUser);
router.put("/:id/enable", enableUser);
router.put("/:id/role", changeRole);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

export default router;
