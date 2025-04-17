import {
  ApiKey,
  User,
  IUserDocument,
  ApiKeyWithPlaintext,
  TRUNC_KEY_LENGTH,
} from "../models/user.model";
import { DbService } from "./db.service";
import { BadRequestError, NotFoundError } from "../middleware/error.middleware";
import mongoose from "mongoose";
import { EncryptionUtils } from "../utils/encryption.utils";

export class ApiKeyService {
  // Regex for validating API key names
  private static readonly API_KEY_NAME_REGEX = /^[a-zA-Z0-9_-]{1,24}$/;

  /**
   * Validate an API key name
   * @param name The API key name to validate
   * @returns True if valid, false otherwise
   */
  private static validateApiKeyName(name: string): boolean {
    return this.API_KEY_NAME_REGEX.test(name);
  }

  /**
   * Generate a new API key for a user
   * @param userId The user ID
   * @param keyName A name/label for the API key
   * @returns The newly created API key with the plaintext key
   */
  public static async generateApiKey(
    userId: string | mongoose.Types.ObjectId,
    keyName: string
  ): Promise<ApiKeyWithPlaintext> {
    if (!keyName || keyName.trim() === "") {
      throw new BadRequestError("API key name is required");
    }

    if (!this.validateApiKeyName(keyName)) {
      throw new BadRequestError(
        "API key name must be 1-24 characters and contain only letters, numbers, underscores, and hyphens"
      );
    }

    return await DbService.executeDbOperation(async () => {
      const user = await User.findById(userId);

      if (!user) {
        throw new NotFoundError("User not found");
      }

      // Check if key name already exists for this user
      if (user.apiKeys?.some((key) => key.name === keyName)) {
        throw new BadRequestError(
          `API key with name "${keyName}" already exists`
        );
      }

      // Generate and save new API key (returns with plaintextKey)
      const apiKey = user.generateApiKey(keyName);
      await user.save();

      return apiKey;
    });
  }

  /**
   * Get all API keys for a user
   * @param userId The user ID
   * @returns Array of API keys with truncated keys for better readability
   */
  public static async getApiKeys(
    userId: string | mongoose.Types.ObjectId
  ): Promise<Partial<ApiKey>[]> {
    return await DbService.executeDbOperation(async () => {
      const user = await User.findById(userId);

      if (!user) {
        throw new NotFoundError("User not found");
      }

      // Return keys with truncated key values but no "key" field for better security
      return (user.apiKeys || []).map((key) => ({
        name: key.name,
        truncatedKey: key.truncatedKey,
        createdAt: key.createdAt,
        lastUsed: key.lastUsed,
      }));
    });
  }

  /**
   * Delete an API key for a user
   * @param userId The user ID
   * @param keyName The name of the key to delete
   */
  public static async deleteApiKey(
    userId: string | mongoose.Types.ObjectId,
    keyName: string
  ): Promise<void> {
    if (!keyName) {
      throw new BadRequestError("API key name is required");
    }

    await DbService.executeDbOperation(async () => {
      const user = await User.findById(userId);

      if (!user || !user.apiKeys) {
        throw new NotFoundError("User not found");
      }

      const initialCount = user.apiKeys.length;

      // Filter out the key with the specified name
      user.apiKeys = user.apiKeys.filter((key) => key.name !== keyName);

      // Check if a key was actually removed
      if (user.apiKeys.length === initialCount) {
        throw new NotFoundError(`API key with name "${keyName}" not found`);
      }

      await user.save();
    });
  }

  /**
   * Validate an API key and return the associated user
   * @param apiKey The plaintext API key to validate
   * @returns The user associated with the API key
   */
  public static async validateApiKey(
    apiKey: string
  ): Promise<IUserDocument | null> {
    if (!apiKey) {
      return null;
    }

    return await DbService.executeDbOperation(async () => {
      // Get some first characters of the API key for initial filtering
      const truncatedKey = apiKey.slice(0, TRUNC_KEY_LENGTH);

      // Find users with potentially matching API keys (using truncated value for efficiency)
      const users = await User.find({
        isEnabled: true,
        "apiKeys.truncatedKey": truncatedKey,
      });

      // Iterate through users and check their keys
      for (const user of users) {
        if (!user.apiKeys || user.apiKeys.length === 0) continue;

        // Find a matching key by decrypting and comparing
        // Filter first by truncated key for efficiency
        const matchingKeyIndex = user.apiKeys.findIndex((keyObj) => {
          try {
            // First check truncated key (already checked in query, but this makes the code more robust)
            if (keyObj.truncatedKey !== truncatedKey) return false;

            // Then decrypt and compare the full key
            const decryptedKey = EncryptionUtils.decrypt(keyObj.key);
            return decryptedKey === apiKey;
          } catch {
            return false;
          }
        });

        // If we found a matching key
        if (matchingKeyIndex >= 0) {
          // Update last used timestamp
          user.apiKeys[matchingKeyIndex].lastUsed = new Date();
          await user.save();
          return user;
        }
      }

      return null;
    });
  }

  /**
   * Mask an API key for display purposes
   * @param apiKey The encrypted API key
   * @returns A masked version (only showing some identifier)
   */
  private static maskApiKey(apiKey: string): string {
    // Just show a portion of the encrypted key as an identifier
    if (apiKey.length <= 10) return apiKey;

    const parts = apiKey.split(":");
    if (parts.length !== 3) return `${apiKey.substring(0, 6)}...`;

    // Show a portion of the IV, which isn't sensitive
    return `${parts[0].substring(0, 8)}...`;
  }
}
