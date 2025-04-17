import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { errorResponse, successResponse } from "../models/response.model";
import { TokenService } from "../services/token.service";
import {
  UnauthorizedError,
  BadRequestError,
  ForbiddenError,
  DatabaseError,
  NotFoundError,
} from "../middleware/error.middleware";
import { CookieService } from "../services/cookie.service";
import { UserService } from "../services/user.service";
import { DbService } from "../services/db.service";
import { PASSWORD_ERROR_MESSAGE, User } from "../models/user.model";
import { asyncHandler } from "../utils/async-handler.util";
import { authRedisUtils } from "../utils/redis.utils";

/**
 * Register a new user
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, username, password, name, role, isEnabled, secret } = req.body;

  // Validate required fields
  if (!email || !username || !password || !name || !secret) {
    throw new BadRequestError("Missing required fields");
  }

  // Validate registration secret
  if (!AuthService.validateRegisterSecret(secret)) {
    throw new ForbiddenError("Invalid registration secret");
  }

  // Create user
  const user = await AuthService.CreateUser(
    email,
    username,
    password,
    name,
    role,
    isEnabled
  );

  res.status(201).json(successResponse("User created successfully", user));
  return;
});

/**
 * Register a new user by admin
 */
export const registerByAdmin = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, username, password, name, role, isEnabled } = req.body;

    // Validate required fields
    if (!email || !username || !password || !name) {
      throw new BadRequestError("Missing required fields");
    }

    // Create user
    const user = await AuthService.CreateUser(
      email,
      username,
      password,
      name,
      role,
      isEnabled
    );

    res.status(201).json(successResponse("User created successfully", user));
    return;
  }
);

/**
 * Login user and create session
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { login, password } = req.body;

  // Validate required fields
  if (!login || !password) {
    throw new BadRequestError("Email/username and password are required");
  }

  // Check if account is locked due to too many failed login attempts
  const lockStatus = await authRedisUtils.isAccountLocked(login);
  if (lockStatus?.locked) {
    const minutes = Math.ceil(lockStatus.remainingSeconds / 60);
    throw new ForbiddenError(
      `Account temporarily locked due to too many failed login attempts. Please try again in ${minutes} minute${minutes > 1 ? "s" : ""}.`
    );
  }

  // Find user by email or username
  const user = await DbService.executeDbOperation(async () => {
    return await UserService.findUserByEmailOrUsername(login);
  });

  // If user doesn't exist, track failed attempt with the provided login credential
  if (!user) {
    await authRedisUtils.trackFailedLoginAttempt(login);
    throw new UnauthorizedError("Invalid login credentials");
  }

  // Check if user is enabled
  if (!user.isEnabled) {
    throw new ForbiddenError("Your account has been disabled");
  }

  // Validate password
  const valid = await user.comparePassword(password);
  if (!valid) {
    // Track failed login attempt - we use both the login credential and the username
    // to ensure we track attempts even if someone tries different variations
    await authRedisUtils.trackFailedLoginAttempt(login);
    await authRedisUtils.trackFailedLoginAttempt(user.username);
    if (login !== user.email) {
      await authRedisUtils.trackFailedLoginAttempt(user.email);
    }

    throw new UnauthorizedError("Invalid login credentials");
  }

  // On successful login, reset failed attempts
  await authRedisUtils.resetFailedLoginAttempts(login);
  await authRedisUtils.resetFailedLoginAttempts(user.username);
  await authRedisUtils.resetFailedLoginAttempts(user.email);

  // Generate tokens
  const accessToken = TokenService.generateAccessToken(user._id);
  const refreshToken = TokenService.generateRefreshToken(user._id);

  // Store refresh token with TTL
  await TokenService.addRefreshTokenToUser(user._id, refreshToken);

  // Set cookies
  CookieService.setAccessTokenCookie(res, accessToken);
  CookieService.setRefreshTokenCookie(res, refreshToken);

  // Prepare user response (exclude sensitive fields)
  const userObj = user.toObject();
  const { password: _, __v: __, ...userResponse } = userObj;

  res.status(200).json(successResponse("Login successful", userResponse));
  return;
});

/**
 * Logout user and invalidate tokens
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const accessToken = req.signedCookies["accessToken"];
  if (accessToken) {
    CookieService.clearAccessTokenCookie(res);
  }

  const refreshToken = req.signedCookies["refreshToken"];
  if (refreshToken) {
    CookieService.clearRefreshTokenCookie(res);
    await TokenService.removeRefreshToken(refreshToken);
  }

  res.status(200).json(successResponse("Logout successful"));
  return;
});

/**
 * Get current user's profile
 */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new UnauthorizedError("Authentication required");
  }

  const userObj = user.toObject();
  const { password: _, __v: __, apiKeys, ...userResponse } = userObj;

  res
    .status(200)
    .json(successResponse("Profile retrieved successfully", userResponse));
  return;
});

/**
 * Refresh access token using refresh token
 */
export const refreshToken = asyncHandler(
  async (req: Request, res: Response) => {
    const refreshToken = req.signedCookies["refreshToken"];
    if (!refreshToken) {
      throw new UnauthorizedError("Refresh token required");
    }

    let payload;
    try {
      payload = TokenService.verifyRefreshToken(refreshToken);
    } catch (jwtError) {
      // Clear invalid tokens
      CookieService.clearRefreshTokenCookie(res);
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    // Verify token exists in database
    const isValid = await TokenService.isRefreshTokenValid(
      payload._id,
      refreshToken
    );

    if (!isValid) {
      CookieService.clearRefreshTokenCookie(res);
      throw new UnauthorizedError("Invalid refresh token");
    }

    // Verify user still exists and is enabled
    const user = await User.findById(payload._id);
    if (!user || !user.isEnabled) {
      await TokenService.removeRefreshToken(refreshToken);
      CookieService.clearRefreshTokenCookie(res);
      throw new UnauthorizedError("User not found or disabled");
    }

    // Generate new tokens with token rotation
    const accessToken = TokenService.generateAccessToken(payload._id);
    CookieService.setAccessTokenCookie(res, accessToken);

    await TokenService.removeRefreshToken(refreshToken);
    const newRefreshToken = TokenService.generateRefreshToken(payload._id);
    await TokenService.addRefreshTokenToUser(payload._id, newRefreshToken);
    CookieService.setRefreshTokenCookie(res, newRefreshToken);

    res.status(200).json(successResponse("Token refreshed successfully"));
    return;
  }
);

/**
 * Change user's password
 */
export const changePassword = asyncHandler(
  async (req: Request, res: Response) => {
    const { password, newPassword } = req.body;

    // Validate required fields
    if (!password || !newPassword) {
      throw new BadRequestError("Current and new password are required");
    }

    // Validate new password format
    if (!AuthService.validatePassword(newPassword)) {
      throw new BadRequestError(PASSWORD_ERROR_MESSAGE);
    }

    // Get user from request
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Update password using service
    await DbService.executeDbOperation(async () => {
      await UserService.replacePassword(user, password, newPassword);
    });

    // Invalidate all refresh tokens
    await TokenService.removeAllRefreshTokens(user._id);

    // Clear cookies
    CookieService.clearAccessTokenCookie(res);
    CookieService.clearRefreshTokenCookie(res);

    res.status(200).json(successResponse("Password changed successfully"));
    return;
  }
);

/**
 * Update current user's profile
 */
export const updateProfile = asyncHandler(
  async (req: Request, res: Response) => {
    // Get user from request
    const user = req.user;
    if (!user) {
      throw new UnauthorizedError("Authentication required");
    }

    const updatedFields = req.body;

    // Remove fields that shouldn't be directly updated by users
    delete updatedFields.password;
    delete updatedFields.username;
    delete updatedFields.role;
    delete updatedFields.isEnabled;
    delete updatedFields.isVerified;

    // Update user profile with DbService
    const updatedUser = await DbService.executeDbOperation(async () => {
      // Check if email is being updated
      if (updatedFields.email && updatedFields.email !== user.email) {
        // Validate email format
        if (
          !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(
            updatedFields.email
          )
        ) {
          throw new BadRequestError("Invalid email format");
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email: updatedFields.email });
        if (existingUser) {
          throw new BadRequestError("Email already in use");
        }

        // Set isVerified to false since email is changing
        updatedFields.isVerified = false;
      }

      // Update the user with all updated fields
      const updatedUser = await User.findByIdAndUpdate(
        user._id,
        updatedFields,
        { new: true, runValidators: true }
      ).select("-password -__v");

      if (!updatedUser) {
        throw new NotFoundError("User not found");
      }

      return updatedUser;
    });

    return res
      .status(200)
      .json(successResponse("Profile updated successfully", updatedUser));
  }
);
