import { Request, Response } from "express";
import { EmailService } from "../services/email.service";
import { VerificationService } from "../services/verification.service";
import { TokenService } from "../services/token.service";
import { AuthService } from "../services/auth.service";
import config from "../config/env";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from "../middleware/error.middleware";
import { asyncHandler } from "../utils/async-handler.util";
import { DbService } from "../services/db.service";
import { User, PASSWORD_ERROR_MESSAGE } from "../models/user.model";
import { successResponse } from "../models/response.model";

const NO_REPLY_EMAIL = `no-reply@${config.EMAIL_DOMAIN}`;

/**
 * Send verification email to user
 * Regular users can only verify their own email
 * Admin users can verify any user's email
 */
export const sendVerificationEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const currentUser = req.user; // Current authenticated user from JWT

    if (!currentUser) {
      throw new BadRequestError("Authentication required");
    }

    const { url } = req.body;

    // Validate URL format
    if (url && !EmailService.isValidUrl(url)) {
      throw new BadRequestError("Invalid URL format");
    }

    let targetUserId = currentUser._id.toString();
    let targetEmail = "";

    // Check if this is a request to verify another user (admin only)
    if (req.body.userId && req.body.userId !== currentUser.id) {
      // Only admins can verify other users' emails
      if (currentUser.role !== "admin") {
        throw new ForbiddenError(
          "You can only request verification for your own account"
        );
      }

      // Admin is verifying another user's email
      targetUserId = req.body.userId;

      // Email is required when verifying another user
      if (!req.body.email) {
        throw new BadRequestError(
          "Email is required when verifying another user"
        );
      }

      if (!EmailService.isValidEmail(req.body.email)) {
        throw new BadRequestError("Invalid email address format");
      }

      targetEmail = req.body.email;
    }

    // Retrieve user information from database
    const user = await DbService.executeDbOperation(async () => {
      return await User.findById(targetUserId)
        .select("+email +name +isVerified")
        .lean();
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    // Set target email if not already set (self-verification case)
    if (!targetEmail) {
      targetEmail = user.email;
    } else if (user.email !== targetEmail) {
      // If admin provided email doesn't match user's email
      throw new BadRequestError("Email does not match user record");
    }

    if (user.isVerified) {
      throw new BadRequestError(
        "Email is already verified. No need to send verification email."
      );
    }

    // Generate verification token
    const token = await VerificationService.generateVerificationToken(
      targetUserId,
      "verify-email"
    );

    const frontendUrl = url || `${config.FRONTEND_URL}/verify`;

    // Send verification email
    await EmailService.sendVerificationEmail(
      targetEmail,
      user.name,
      token,
      NO_REPLY_EMAIL,
      frontendUrl
    );

    return res
      .status(200)
      .json(successResponse("Verification email sent successfully"));
  }
);

/**
 * Verify email address using token
 */
export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!token) {
    throw new BadRequestError("Token is required");

  }

  const userId = await VerificationService.verifyEmailToken(token);
  return res.status(200).json(successResponse("Email verified successfully"));
});

/**
 * Send reset password email to user
 */
export const sendResetPasswordEmail = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, url } = req.body;

    // Validate required fields
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    if (!EmailService.isValidEmail(email)) {
      throw new BadRequestError("Invalid email address format");
    }

    // Validate URL format
    if (url && !EmailService.isValidUrl(url)) {
      throw new BadRequestError("Invalid URL format");
    }

    const user = await DbService.executeDbOperation(async () => {
      return await User.findOne({ email })
        .select("+email +name +isVerified")
        .lean();
    });

    if (!user) {
      return res
        .status(200)
        .json(
          successResponse(
            "If this email is registered, a reset password email has been sent."
          )
        );
    }

    const frontendUrl = url || `${config.FRONTEND_URL}/reset-password`;

    // Generate reset password token
    const token = await VerificationService.generateVerificationToken(
      user._id.toString(),
      "reset-password"
    );

    // Send reset password email
    await EmailService.sendPasswordResetEmail(
      email,
      user.name,
      token,
      NO_REPLY_EMAIL,
      frontendUrl
    );
    return res
      .status(200)
      .json(
        successResponse(
          "If this email is registered, a reset password email has been sent."
        )
      );
  }
);

/**
 * Reset password using token
 */
export const resetPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { token } = req.params;
    const { newPassword } = req.body;

    // Validate token and password
    if (!token) {
      throw new BadRequestError("Token is required");
    }

    if (!newPassword) {
      throw new BadRequestError("New password is required");
    }

    // Validate password format
    if (!AuthService.validatePassword(newPassword)) {
      throw new BadRequestError(PASSWORD_ERROR_MESSAGE);
    }

    // Verify token and get user ID
    const userId = await VerificationService.verifyPasswordResetToken(token);

    // Update user password
    await DbService.executeDbOperation(async () => {
      const user = await User.findById(userId);

      if (!user) {
        throw new NotFoundError("User not found");
      }

      // Set new password and save
      user.password = newPassword;
      await user.save();

      // Invalidate all existing sessions
      await TokenService.removeAllRefreshTokens(userId);

      return user;
    });

    return res
      .status(200)
      .json(
        successResponse(
          "Password reset successful. You can now log in with your new password."
        )
      );
  }
);
