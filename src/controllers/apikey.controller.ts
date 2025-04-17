import { Request, Response, NextFunction } from "express";
import { ApiKeyService } from "../services/apikey.service";
import { BadRequestError } from "../middleware/error.middleware";
import { asyncHandler } from "../utils/async-handler.util";
import { successResponse } from "../models/response.model";

export class ApiKeyController {
  /**
   * Generate a new API key for the authenticated user
   */
  public static createApiKey = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const { name } = req.body;

      if (!name) {
        throw new BadRequestError("API key name is required");
      }

      const userId = req.user!._id;

      // Generate new API key
      const apiKey = await ApiKeyService.generateApiKey(userId, name);

      // Return the full API key - this is the only time it will be fully visible
      res.status(201).json(
        successResponse("API key created successfully", {
          ...apiKey,
          note: "Keep this API key safe. It will not be shown again.",
        })
      );
    }
  );

  /**
   * Get all API keys for the authenticated user
   */
  public static getApiKeys = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const userId = req.user!._id;

      // Get user's API keys (with masked key values)
      const apiKeys = await ApiKeyService.getApiKeys(userId);

      res.status(200).json(successResponse("API keys retrieved successfully", apiKeys));
    }
  );

  /**
   * Delete an API key by name
   */
  public static deleteApiKey = asyncHandler(
    async (req: Request, res: Response, next: NextFunction) => {
      const keyName = req.params.name;
      const userId = req.user!._id;

      await ApiKeyService.deleteApiKey(userId, keyName);

      res.status(200).json(successResponse("API key deleted successfully"));
    }
  );
}
