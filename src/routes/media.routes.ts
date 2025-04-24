import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import {
  uploadProductMedia,
  uploadProductThumbnail,
  deleteProductThumbnail,
  deleteProductMedia,
  uploadCategoryThumbnail,
  deleteCategoryThumbnail,
  cleanupMedia,
  cleanupTempFiles,
  uploadPageMedia,
  listPageMedia,
  deletePageMedia,
} from "../controllers/media.controller";

const router = Router();

// Protected routes - require authentication (explicitly allowing API key auth)
router.use((req, res, next) =>
  authenticate(req, res, next, { allowApiKey: true })
);

// Product media routes - admin, manager, and staff access only
const staffRoles = ["admin", "manager", "staff"];
const adminRole = ["admin"];

// Upload product images
router.post("/product/:id/upload", authorize(staffRoles), uploadProductMedia);

// Product thumbnail management
router.post(
  "/product/:id/thumbnail",
  authorize(staffRoles),
  uploadProductThumbnail
);
router.delete(
  "/product/:id/thumbnail",
  authorize(staffRoles),
  deleteProductThumbnail
);

// Delete product images
router.delete("/product/:id/delete", authorize(staffRoles), deleteProductMedia);

// Category thumbnail management
router.post(
  "/category/:id/thumbnail",
  authorize(staffRoles),
  uploadCategoryThumbnail
);
router.delete(
  "/category/:id/thumbnail",
  authorize(staffRoles),
  deleteCategoryThumbnail
);

// Page media management - admin access
router.post("/page/upload", authorize(adminRole), uploadPageMedia);
router.get("/page/list", authorize(adminRole), listPageMedia);
router.delete("/page/delete", authorize(adminRole), deletePageMedia);

// Media management - admin only
router.post("/cleanup", authorize(["admin"]), cleanupMedia);
router.post("/cleanup/temp", authorize(["admin"]), cleanupTempFiles);

export default router;
