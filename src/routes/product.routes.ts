import { Router } from "express";
import {
  authenticate,
  authorize,
  cacheBypass,
} from "../middleware/auth.middleware";
import {
  createProduct,
  bulkCreateProducts,
  deleteProduct,
  getProductById,
  searchProducts,
  updateProduct,
  getFeaturedProducts,
  getMostViewedProducts,
  getTrendingProducts,
  getProductsByCategory,
  incrementProductViews,
  updateProductStock,
  bulkDeleteProducts,
  getAllProductIds,
  updateProductRecentViews,
} from "../controllers/product.controller";

const router = Router();

// Public routes for retrieving products
router.get("/featured", cacheBypass, getFeaturedProducts);
router.get("/popular", cacheBypass, getMostViewedProducts);
router.get("/trending", cacheBypass, getTrendingProducts); // New endpoint for trending products
router.get("/category/:categoryIdOrSlug", cacheBypass, getProductsByCategory);
router.get("/search", cacheBypass, searchProducts);
router.get("/id/:id", cacheBypass, getProductById);
router.post("/views/:id", incrementProductViews); // Track product views

// Protected routes - require authentication
router.use(authenticate);

router.get("/ids", authorize(["admin"]), cacheBypass, getAllProductIds);
router.post("/", authorize(["admin", "manager", "staff"]), createProduct);
router.post("/bulk", authorize(["admin", "manager"]), bulkCreateProducts);
router.put("/:id", authorize(["admin", "manager", "staff"]), updateProduct);
router.put(
  "/:id/stock",
  authorize(["admin", "manager", "staff"]),
  updateProductStock
);
// New endpoint to manually update product recent views counts
router.post(
  "/update-recent-views",
  authorize(["admin", "manager"]),
  updateProductRecentViews
);
router.delete("/:id", authorize(["admin", "manager", "staff"]), deleteProduct);
router.delete("/", authorize(["admin", "manager"]), bulkDeleteProducts);

export default router;
