import { Request, Response, NextFunction } from "express";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { authRedis } from "../config/redis";
import { errorResponse } from "../models/response.model";
import { config } from "../config/env";

// Rate limiter key prefixes
const RATE_LIMIT_PREFIXES = {
  API: "rl:api",
  AUTH: "rl:auth",
  SENSITIVE: "rl:sensitive",
  CUSTOM: "rl:custom",
};

// Main rate limiter instance for general API endpoints
const apiLimiter = new RateLimiterRedis({
  storeClient: authRedis,
  keyPrefix: RATE_LIMIT_PREFIXES.API,
  points: config.RATE_LIMIT_POINTS || 60, // Number of requests allowed in duration
  duration: config.RATE_LIMIT_DURATION || 60, // Per 60 seconds (1 minute)
  blockDuration: 60, // Block for 1 minute if exceeded
});

// Strict rate limiter for auth endpoints (login, register, etc.)
const authLimiter = new RateLimiterRedis({
  storeClient: authRedis,
  keyPrefix: RATE_LIMIT_PREFIXES.AUTH,
  points: 10, // Fewer requests allowed
  duration: 60, // Per 60 seconds
  blockDuration: 120, // Block for 2 minutes if exceeded
});

// Extra strict limiter for sensitive operations (password reset, etc.)
const sensitiveOpLimiter = new RateLimiterRedis({
  storeClient: authRedis,
  keyPrefix: RATE_LIMIT_PREFIXES.SENSITIVE,
  points: 3, // Very few attempts
  duration: 300, // Per 5 minutes
  blockDuration: 300, // Block for 5 minutes if exceeded
});

/**
 * Get IP address from request
 * Handles various proxy configurations
 */
const getIpFromRequest = (req: Request): string => {
  // If behind a trusted proxy, use X-Forwarded-For
  if (config.TRUSTED_PROXIES) {
    const forwardedFor = req.headers["x-forwarded-for"];
    if (forwardedFor) {
      // X-Forwarded-For can be comma-separated list; take the first (client) IP
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(",")[0].trim();
      return ips;
    }
  }

  return req.ip || "unknown";
};

/**
 * Standard rate limiter middleware
 * For general API endpoints
 */
export const rateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Use IP as rate limit key, or user ID if authenticated
    const key = req.user?.id || getIpFromRequest(req);

    await apiLimiter.consume(key);
    return next();
  } catch (error: any) {
    if (error instanceof Error) {
      return next(error);
    }

    // Rate limit exceeded
    const retryAfter = Math.floor(error.msBeforeNext / 1000) || 60;
    res.set("Retry-After", String(retryAfter));
    res.status(429).json(
      errorResponse("Too many requests, please try again later", {
        retryAfter,
      })
    );
  }
};

/**
 * Auth rate limiter middleware
 * For authentication endpoints (login, register, etc.)
 */
export const authRateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // For auth endpoints, always use IP address
    const key = getIpFromRequest(req);

    await authLimiter.consume(key);
    return next();
  } catch (error: any) {
    if (error instanceof Error) {
      return next(error);
    }

    const retryAfter = Math.floor(error.msBeforeNext / 1000) || 120;
    res.set("Retry-After", String(retryAfter));
    res.status(429).json(
      errorResponse(
        "Too many authentication attempts, please try again later",
        {
          retryAfter,
        }
      )
    );
  }
};

/**
 * Sensitive operations rate limiter
 * For password reset, email verification, etc.
 */
export const sensitiveRateLimiter = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Use combination of IP and email/username when available
    const identifier = req.body.email || req.body.username || "";
    const key = `${getIpFromRequest(req)}:${identifier}`;

    await sensitiveOpLimiter.consume(key);
    return next();
  } catch (error: any) {
    if (error instanceof Error) {
      return next(error);
    }

    const retryAfter = Math.floor(error.msBeforeNext / 1000) || 300;
    res.set("Retry-After", String(retryAfter));
    res.status(429).json(
      errorResponse("Rate limit exceeded for sensitive operations", {
        retryAfter,
      })
    );
  }
};

/**
 * Create a custom rate limiter with specified parameters
 * Useful for specific endpoints with custom requirements
 */
export const createCustomRateLimiter = (
  points: number,
  duration: number,
  keyPrefix: string = RATE_LIMIT_PREFIXES.CUSTOM,
  blockDuration: number = duration
) => {
  const limiter = new RateLimiterRedis({
    storeClient: authRedis,
    keyPrefix,
    points,
    duration,
    blockDuration,
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const key = req.user?.id || getIpFromRequest(req);
      await limiter.consume(key);
      return next();
    } catch (error: any) {
      if (error instanceof Error) {
        return next(error);
      }

      const retryAfter = Math.floor(error.msBeforeNext / 1000) || blockDuration;
      res.set("Retry-After", String(retryAfter));
      res.status(429).json(
        errorResponse("Rate limit exceeded", {
          retryAfter,
        })
      );
    }
  };
};
