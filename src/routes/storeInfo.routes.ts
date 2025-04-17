import { Router } from "express";
import storeInfoController from "../controllers/storeInfo.controller";
import { authenticate, authorize, cacheBypass } from "../middleware/auth.middleware";

const router = Router();

router.get("/", storeInfoController.getStoreInfo);

router.put(
  "/",
  authenticate,
  authorize(["admin"]),
  cacheBypass,
  storeInfoController.updateStoreInfo
);

router.put(
  "/business-hours",
  authenticate,
  authorize(["admin"]),
  storeInfoController.updateBusinessHours
);

export default router;
