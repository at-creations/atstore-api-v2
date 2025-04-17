import { Router } from "express";

import authRoutes from "./auth.routes";
import staffRoutes from "./staff.routes";
import categoryRoutes from "./category.routes";
import productRoutes from "./product.routes";
import mediaRoutes from "./media.routes";
import healthRoutes from "./health.routes";
import orderRoutes from "./order.routes";
import verifyRoutes from "./verify.routes";
import storeInfoRoutes from "./storeInfo.routes";
import { apiKeyRoutes } from "./apikey.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/verify", verifyRoutes);
router.use("/staff", staffRoutes);
router.use("/category", categoryRoutes);
router.use("/product", productRoutes);
router.use("/media", mediaRoutes);
router.use("/health", healthRoutes);
router.use("/order", orderRoutes);
router.use("/store-info", storeInfoRoutes);
router.use("/apikeys", apiKeyRoutes);

export default router;
