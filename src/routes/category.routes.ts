import { Router } from "express";
import {
  authenticate,
  authorize,
  cacheBypass,
} from "../middleware/auth.middleware";
import {
  createCategory,
  bulkCreateCategories,
  deleteCategory,
  getCategoryByIdOrSlug,
  searchCategories,
  updateCategory,
} from "../controllers/category.controller";

const router = Router();

// Public routes for retrieving categories
router.get("/:idOrSlug", cacheBypass, getCategoryByIdOrSlug);
router.get("/", cacheBypass, searchCategories);

// Protected routes - require authentication
router.use(authenticate);

// Admin/manager only routes
router.post("/", authorize(["admin", "manager"]), createCategory);
router.post("/bulk", authorize(["admin", "manager"]), bulkCreateCategories);
router.put("/:id", authorize(["admin", "manager"]), updateCategory);
router.delete("/:id", authorize(["admin", "manager"]), deleteCategory);

export default router;
