import crypto from "crypto";
import { authRedis } from "../config/redis";
import { User } from "../models/user.model";
import { DbService } from "./db.service";
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from "../middleware/error.middleware";
import { authRedisUtils } from "../utils/redis.utils";

// Token prefix for Redis
const EMAIL_VERIFICATION_PREFIX = "email:verify:";
const PASSWORD_RESET_PREFIX = "pswd:reset:";
// Expiration time (3 hours in seconds)
const TOKEN_EXPIRY = 3 * 60 * 60;

export class VerificationService {
  /**
   * Generate a verification token for a user
   * @param userId User ID
   * @param type Type of verification (`verify-email` or `reset-password`)
   * @returns Generated verification token
   */
  public static async generateVerificationToken(
    userId: string,
    type: "verify-email" | "reset-password"
  ): Promise<string> {
    if (!DbService.isValidObjectId(userId)) {
      throw new BadRequestError("Invalid user ID");
    }

    // Generate a random token
    const token = crypto.randomBytes(32).toString("hex");

    try {
      // Store token in Redis with user ID as value
      if (type === "verify-email") {
        authRedisUtils.set(
          `${EMAIL_VERIFICATION_PREFIX}${token}`,
          userId,
          TOKEN_EXPIRY
        );
      } else if (type === "reset-password") {
        authRedisUtils.set(
          `${PASSWORD_RESET_PREFIX}${token}`,
          userId,
          TOKEN_EXPIRY
        );
      }

      return token;
    } catch {
      throw new InternalServerError("Failed to generate token");
    }
  }

  /**
   * Verify an email verification token and mark user as verified
   * @param token Verification token
   * @returns The verified user's ID
   */
  public static async verifyEmailToken(token: string): Promise<string> {
    // Get user ID from Redis
    const key = `${EMAIL_VERIFICATION_PREFIX}${token}`;
    const userId = await authRedis.get(key);

    if (!userId) {
      throw new BadRequestError("Invalid or expired verification token");
    }

    // Mark user as verified
    const user = await DbService.executeDbOperation(async () => {
      return await User.findByIdAndUpdate(
        userId,
        { isVerified: true },
        { new: true }
      );
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Delete the token after use
    await authRedis.del(key);

    return userId;
  }

  /**
   * Verify a password reset token and return the user ID
   * @param token Password reset token
   * @returns The user ID associated with the token
   */
  public static async verifyPasswordResetToken(token: string): Promise<string> {
    // Get user ID from Redis
    const key = `${PASSWORD_RESET_PREFIX}${token}`;
    const userId = await authRedis.get(key);

    if (!userId) {
      throw new BadRequestError("Invalid or expired password reset token");
    }

    // Delete the token after use
    await authRedis.del(key);

    return userId;
  }
}
