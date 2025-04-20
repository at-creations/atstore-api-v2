import { Request, Response, NextFunction } from "express";
import storeInfoService from "../services/storeInfo.service";
import { asyncHandler } from "../utils/async-handler.util";
import { BusinessHours } from "../models/storeInfo.model";
import { NotFoundError } from "../middleware/error.middleware";
import { successResponse } from "../models/response.model";
import {
  cacheRedisUtils,
  REDIS_CACHE_KEYS,
  CACHE_EXPIRY,
} from "../utils/redis.utils";

/**
 * Store Info Controller
 * Manages store information endpoints
 */
export class StoreInfoController {
  /**
   * Get store information
   * Public endpoint - no authentication required
   */
  getStoreInfo = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Define a cache key for store info
      const cacheKey = `${REDIS_CACHE_KEYS.STORE.INFO}general`;

      // Try to get store info from cache
      let storeInfo = !req.bypassCache
        ? await cacheRedisUtils.get(cacheKey)
        : null;

      if (!storeInfo) {
        // Cache miss or bypass - get from database
        storeInfo = await storeInfoService.getStoreInfo();

        if (!storeInfo) {
          throw new NotFoundError("Store information not found");
        }

        // Store in cache with long expiry if not bypassing cache
        if (!req.bypassCache) {
          await cacheRedisUtils.set(cacheKey, storeInfo, CACHE_EXPIRY.LONG);
        }
      }

      res
        .status(200)
        .json(
          successResponse("Store information retrieved successfully", storeInfo)
        );
    }
  );

  /**
   * Update store information
   * Admin only endpoint
   */
  updateStoreInfo = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Only include defined fields from the request body
      const updateData: any = {};
      const fieldsToRemove: string[] = [];
      const { email, phone, address, businessHours } = req.body;

      // Check if fields should be updated or removed
      if (email !== undefined) {
        if (typeof email === "string" && email.toLowerCase() === "_removed_") {
          fieldsToRemove.push("email");
        } else {
          updateData.email = email;
        }
      }

      if (phone !== undefined) {
        if (typeof phone === "string" && phone.toLowerCase() === "_removed_") {
          fieldsToRemove.push("phone");
        } else {
          updateData.phone = phone;
        }
      }

      if (address !== undefined) {
        if (
          typeof address === "string" &&
          address.toLowerCase() === "_removed_"
        ) {
          fieldsToRemove.push("address");
        } else {
          updateData.address = address;
        }
      }

      if (businessHours !== undefined) {
        if (
          typeof businessHours === "string" &&
          businessHours.toLowerCase() === "_removed_"
        ) {
          fieldsToRemove.push("businessHours");
        } else {
          updateData.businessHours = businessHours;
        }
      }

      const updatedStoreInfo = await storeInfoService.updateStoreInfo(
        updateData,
        fieldsToRemove
      );

      // Invalidate store info cache after update
      await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.STORE.INFO}general`);

      res
        .status(200)
        .json(
          successResponse(
            "Store information updated successfully",
            updatedStoreInfo
          )
        );
    }
  );

  /**
   * Update business hours only
   * Admin only endpoint
   */
  updateBusinessHours = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const { businessHours }: { businessHours: BusinessHours[] } = req.body;

      const updatedStoreInfo =
        await storeInfoService.updateBusinessHours(businessHours);

      // Invalidate store info cache after business hours update
      await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.STORE.INFO}general`);

      res
        .status(200)
        .json(
          successResponse(
            "Business hours updated successfully",
            updatedStoreInfo
          )
        );
    }
  );
}

export default new StoreInfoController();
