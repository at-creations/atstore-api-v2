import {
  StoreInfo,
  IStoreInfo,
  BusinessHours,
} from "../models/storeInfo.model";
import { DbService } from "../services/db.service";
import { NotFoundError } from "../middleware/error.middleware";

class StoreInfoService {
  /**
   * Get store information
   * @returns Promise containing store info or null if not found
   */
  async getStoreInfo(): Promise<IStoreInfo | null> {
    return await DbService.executeDbOperation(async () => {
      // There should only be one store info document
      const storeInfo = await StoreInfo.findOne()
        .select("-__v -_id -createdAt")
        .lean();
      return storeInfo;
    });
  }

  /**
   * Update store information (admin only)
   * @param storeInfoData Updated store information
   * @returns Updated store info
   */
  async updateStoreInfo(storeInfoData: IStoreInfo): Promise<IStoreInfo> {
    return await DbService.executeDbOperation(async () => {
      const storeInfo = await StoreInfo.findOne();

      if (storeInfo) {
        // Update existing document
        Object.assign(storeInfo, storeInfoData);
        await storeInfo.save();
        const { __v, _id, createdAt, ...updatedStoreInfo } = storeInfo.toObject();
        return updatedStoreInfo;
      } else {
        // Create new document if it doesn't exist
        const newStoreInfo = new StoreInfo(storeInfoData);
        await newStoreInfo.save();
        const { __v, _id, createdAt, ...createdStoreInfo } = newStoreInfo.toObject();
        return createdStoreInfo;
      }
    });
  }

  /**
   * Update business hours only (admin only)
   * @param businessHours Array of business hours
   * @returns Updated store info
   * @throws NotFoundError if store info doesn't exist
   */
  async updateBusinessHours(
    businessHours: BusinessHours[]
  ): Promise<IStoreInfo> {
    return await DbService.executeDbOperation(async () => {
      const storeInfo = await StoreInfo.findOne();

      if (!storeInfo) {
        throw new NotFoundError("Store information not found");
      }

      storeInfo.businessHours = businessHours;
      await storeInfo.save();
      const { __v, _id, createdAt, ...updatedStoreInfo } = storeInfo.toObject();
      return updatedStoreInfo;
    });
  }
}

export default new StoreInfoService();
