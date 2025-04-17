import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import config from "../config/env";
import ms from "ms";
import { RefreshToken } from "../models/refreshToken.model";

// Purpose: Interface for the token payload.
interface TokenPayload {
  _id: string;
}

export class TokenService {
  public static ACCESS_TOKEN_EXPIRATION = "15m" as ms.StringValue;
  public static REFRESH_TOKEN_EXPIRATION = "3d" as ms.StringValue;

  /**
   * Generates a JSON Web Token (JWT) for user authentication.
   *
   * @param userId - The unique identifier of the user. Can be a string or a `mongoose.Types.ObjectId`.
   * @returns A signed JWT string containing the user ID and token type.
   *
   * The token is signed using the secret defined in the application configuration
   * and includes an expiration time specified by `ACCESS_TOKEN_EXPIRATION`.
   */
  public static generateAccessToken(
    userId: string | mongoose.Types.ObjectId,
  ): string {
    const id = userId.toString();
    return jwt.sign({ _id: id }, config.JWT_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRATION,
    });
  }

  /**
   * Generates a refresh token for a given user.
   *
   * @param userId - The ID of the user for whom the refresh token is being generated.
   *                 This can be either a string or a Mongoose ObjectId.
   * @returns A signed JSON Web Token (JWT) containing the user's ID and token type,
   *          with an expiration time defined by `REFRESH_TOKEN_EXPIRATION`.
   *
   * @throws Will throw an error if the signing process fails or if the required
   *         configuration values (e.g., `JWT_REFRESH_SECRET`) are not properly set.
   */
  public static generateRefreshToken(
    userId: string | mongoose.Types.ObjectId,
  ): string {
    const id = userId.toString();
    return jwt.sign({ _id: id }, config.JWT_REFRESH_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRATION,
    });
  }

  /**
   * Verifies the provided access token and decodes its payload.
   *
   * @param token - The JWT access token to be verified.
   * @returns The decoded payload of the token as a `TokenPayload` object.
   * @throws {JsonWebTokenError} If the token is invalid or verification fails.
   * @throws {NotBeforeError} If the token is used before its "nbf" claim.
   * @throws {TokenExpiredError} If the token has expired.
   */
  public static verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, config.JWT_SECRET) as TokenPayload;
  }

  /**
   * Verifies the validity of a given refresh token.
   *
   * @param token - The refresh token to be verified.
   * @returns The payload of the verified token as a `TokenPayload` object.
   * @throws An error if the token is invalid or verification fails.
   */
  public static verifyRefreshToken(token: string): TokenPayload {
    return jwt.verify(token, config.JWT_REFRESH_SECRET) as TokenPayload;
  }

  /**
   * Adds a refresh token to the database.
   *
   * @param userId - The ID of the user to whom the refresh token belongs.
   * @param refreshToken - The refresh token string.
   * @returns A promise that resolves when the token is saved.
   */
  public static async addRefreshTokenToUser(
    userId: string | mongoose.Types.ObjectId,
    refreshToken: string,
  ): Promise<void> {
    // Calculate expiration date (3 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3);

    await RefreshToken.create({
      userId,
      token: refreshToken,
      expiresAt,
    });
  }

  /**
   * Removes a specific refresh token from the database.
   *
   * @param refreshToken - The refresh token to be removed.
   * @returns A promise that resolves when the operation is complete.
   */
  public static async removeRefreshToken(refreshToken: string): Promise<void> {
    await RefreshToken.deleteOne({ token: refreshToken });
  }

  /**
   * Removes all refresh tokens for a specific user.
   *
   * @param userId - The ID of the user whose refresh tokens should be removed.
   * @returns A promise that resolves when the operation is complete.
   */
  public static async removeAllRefreshTokens(
    userId: string | mongoose.Types.ObjectId,
  ): Promise<void> {
    await RefreshToken.deleteMany({ userId });
  }

  /**
   * Validates whether a refresh token exists in the database and has not expired.
   *
   * @param userId - The ID of the user.
   * @param refreshToken - The refresh token to validate.
   * @returns A promise that resolves to `true` if the token is valid, otherwise `false`.
   */
  public static async isRefreshTokenValid(
    userId: string | mongoose.Types.ObjectId,
    refreshToken: string,
  ): Promise<boolean> {
    const token = await RefreshToken.findOne({
      userId,
      token: refreshToken,
      expiresAt: { $gt: new Date() },
    });

    return !!token;
  }
}
