import { Request, Response, NextFunction } from "express";
import { UnauthorizedError, ForbiddenError } from "./error.middleware";
import { TokenService } from "../services/token.service";
import { IUserDocument, User } from "../models/user.model";
import { DbService } from "../services/db.service";
import { ApiKeyService } from "../services/apikey.service";

declare global {
  namespace Express {
    interface Request {
      user?: IUserDocument;
      bypassCache?: boolean;
    }
  }
}

/**
 * Authentication middleware
 * Uses global error handling pattern for consistency
 * Supports both cookie-based authentication and API key authentication
 * @param options Configuration options for authentication
 * @param options.allowApiKey Whether to allow API key authentication (defaults to false)
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
  options: { allowApiKey?: boolean } = { allowApiKey: false }
): Promise<void> => {
  try {
    // First check for API Key in header if API key authentication is allowed
    const apiKey = req.headers["x-api-key"] as string;

    if (options.allowApiKey && apiKey) {
      // Try to authenticate with API key using the ApiKeyService
      // This handles decryption and validation of the API key
      const user = await ApiKeyService.validateApiKey(apiKey);

      // If user found with valid API key
      if (user) {
        // Set user on request object
        req.user = user;
        return next();
      }
    }

    // If API key authentication failed or is not allowed, try cookie authentication
    const accessToken = req.signedCookies["accessToken"];

    if (!accessToken) {
      return next(new UnauthorizedError("Authentication required"));
    }

    // Verify token
    const payload = TokenService.verifyAccessToken(accessToken);

    // Find user - use DbService for consistent error handling
    const user = await DbService.executeDbOperation(async () => {
      return await User.findById(payload._id);
    });

    // Check if user exists and is enabled
    if (!user || !user.isEnabled) {
      return next(new UnauthorizedError("User not found or disabled"));
    }

    // Set user on request object
    req.user = user;
    next();
  } catch (error) {
    // Forward all errors to the global error handler
    next(error);
  }
};

/**
 * Role-based authorization middleware
 * Uses global error handling pattern for consistency
 */
export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Verify user is authenticated
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }

    // Check if user has required role
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError("Insufficient permissions"));
    }

    next();
  };
};

/**
 * Cache bypass middleware for staff users
 * Allows staff, managers, and admins to bypass cache when query param ?cache=false is present
 * Will authenticate the user if cache=false is present but user is not already authenticated
 */
export const cacheBypass = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Check if cache query parameter is set to 'false'
  const shouldBypassCache = req.query.cache === "false";

  // If not trying to bypass cache, continue normally
  if (!shouldBypassCache) {
    req.bypassCache = false;
    return next();
  }

  try {
    // If user is not authenticated and we want to bypass cache, authenticate them
    if (!req.user && shouldBypassCache) {
      const accessToken = req.signedCookies["accessToken"];

      if (accessToken) {
        // Verify token
        const payload = TokenService.verifyAccessToken(accessToken);

        // Find user
        const user = await DbService.executeDbOperation(async () => {
          return await User.findById(payload._id);
        });

        // Set user if found and enabled
        if (user && user.isEnabled) {
          req.user = user;
        }
      }
    }

    // Check if user is authenticated and has a staff role
    const isStaffUser =
      req.user && ["staff", "manager", "admin"].includes(req.user.role);

    // Set bypassCache flag on request if user is staff and cache=false is set
    req.bypassCache = shouldBypassCache && isStaffUser;

    next();
  } catch (error) {
    // Forward all errors to the global error handler
    // Note: We don't fail the request if authentication fails, we just don't bypass cache
    req.bypassCache = false;
    next();
  }
};

/**
 * Email verification middleware
 * Uses global error handling pattern for consistency
 */
export const requireVerified = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Verify user is authenticated
  if (!req.user) {
    return next(new UnauthorizedError("Authentication required"));
  }

  // Check if user has verified email
  if (!req.user.isVerified) {
    return next(new ForbiddenError("Email verification required"));
  }

  next();
};

/**
 * Optional authentication middleware
 * Attaches user to request if valid token exists, but doesn't block requests
 * Useful for routes where authentication is optional
 */
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Get token from cookies
  const accessToken = req.signedCookies["accessToken"];

  // If no token exists, continue without authentication
  if (!accessToken) {
    return next();
  }

  try {
    // Verify token
    const payload = TokenService.verifyAccessToken(accessToken);

    // Find user - use DbService for consistent error handling
    const user = await DbService.executeDbOperation(async () => {
      return await User.findById(payload._id);
    });

    // If user exists and is enabled, attach to request
    if (user && user.isEnabled) {
      req.user = user;
    }

    // Continue request processing regardless of authentication result
    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};
