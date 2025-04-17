import { Request, Response, NextFunction } from "express";
import { BadRequestError, ForbiddenError } from "./error.middleware";
import crypto from "crypto";
import config from "../config/env";
import { successResponse } from "../models/response.model";

// Constants for CSRF implementation
const CSRF_COOKIE_NAME = "xsrf-token";
const CSRF_HEADER_NAME = "X-XSRF-TOKEN";
const CSRF_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours (in milliseconds)

// Secret key for signing CSRF tokens
// Use a dedicated secret for CSRF tokens, different from other app secrets
const CSRF_SECRET = config.CSRF_SECRET || config.COOKIE_SECRET;

interface CsrfTokenObject {
  token: string;
  exp: number;
}

/**
 * Generate a cryptographically secure CSRF token
 * The token consists of: base64(timestamp | random data | HMAC)
 * @param sessionIdentifier A stable identifier for the session (user ID or session ID)
 * @returns A secure token with embedded timestamp and signature
 */
const generateCsrfToken = (sessionIdentifier: string): CsrfTokenObject => {
  // Create timestamp that expires
  const timestamp = Date.now();

  // Generate random bytes for the token
  const randomBytes = crypto.randomBytes(16).toString("hex");

  // Create a payload combining timestamp, randomness, and session identifier
  const payload = `${timestamp}|${randomBytes}|${sessionIdentifier}`;

  // Generate HMAC for the payload using the secret key
  const hmac = crypto
    .createHmac("sha256", CSRF_SECRET)
    .update(payload)
    .digest("hex");

  // Combine payload and HMAC, then encode as base64
  const token = Buffer.from(`${payload}|${hmac}`).toString("base64");
  const exp = timestamp + CSRF_TOKEN_EXPIRY;

  return { token, exp };
};

/**
 * Validate a CSRF token without needing server-side storage
 * @param token The CSRF token to validate
 * @param sessionIdentifier The current session identifier (user ID or session ID)
 * @returns True if token is valid, false otherwise
 */
const validateCsrfToken = (
  token: string,
  sessionIdentifier: string
): boolean => {
  try {
    // Decode the token
    const decoded = Buffer.from(token, "base64").toString();

    // Split into components: timestamp|randomBytes|originalSessionId|hmac
    const parts = decoded.split("|");
    if (parts.length !== 4) {
      return false;
    }

    const [timestamp, randomBytes, originalSessionId, receivedHmac] = parts;

    // Check if token is expired
    const tokenTimestamp = parseInt(timestamp, 10);
    if (
      isNaN(tokenTimestamp) ||
      Date.now() - tokenTimestamp > CSRF_TOKEN_EXPIRY
    ) {
      return false;
    }

    // Verify the session identifier matches
    if (originalSessionId !== sessionIdentifier) {
      return false;
    }

    // Regenerate the HMAC using the extracted data and verify it matches
    const payload = `${timestamp}|${randomBytes}|${originalSessionId}`;
    const expectedHmac = crypto
      .createHmac("sha256", CSRF_SECRET)
      .update(payload)
      .digest("hex");

    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(expectedHmac),
      Buffer.from(receivedHmac)
    );
  } catch (error) {
    console.error("Error validating CSRF token:", error);
    return false;
  }
};

/**
 * Generate a CSRF token and set it as a cookie
 * Endpoint for clients to request a new CSRF token
 */
export const generateCsrfTokenHandler = (req: Request, res: Response): void => {
  // Get session identifier (user ID or IP address)
  const sessionId = req.user?.id || req.ip || "anonymous";

  // Generate a new token
  const { token, exp } = generateCsrfToken(sessionId);

  // Set as a regular cookie (not HTTP-only) so JavaScript can read it
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Allow JavaScript to read this cookie
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    signed: false,
    maxAge: CSRF_TOKEN_EXPIRY,
  });

  // Also return token in response body for SPAs
  res.status(200).json(successResponse("CSRF token generated", { exp }));
};

/**
 * CSRF Protection Middleware
 * Uses double-submit cookie pattern with HMAC validation
 */
export const csrfProtection = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Skip CSRF check for safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  try {
    // Get session identifier (user ID or IP address)
    const sessionId = req.user?.id || req.ip || "anonymous";

    // Get token from request header
    const headerToken = req.headers[CSRF_HEADER_NAME.toLowerCase()] as string;
    if (!headerToken) {
      throw new BadRequestError("CSRF token missing from header");
    }

    // Get token from cookie
    const cookieToken = req.cookies[CSRF_COOKIE_NAME];
    if (!cookieToken) {
      throw new BadRequestError("CSRF token missing from cookies");
    }

    // Double submit check - tokens should match
    if (headerToken !== cookieToken) {
      throw new ForbiddenError("CSRF token mismatch between header and cookie");
    }

    // Validate the token
    if (!validateCsrfToken(headerToken, sessionId)) {
      throw new ForbiddenError("Invalid or expired CSRF token");
    }

    // Token is valid, proceed
    next();
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof ForbiddenError) {
      next(error);
    } else {
      next(new ForbiddenError("CSRF validation failed"));
    }
  }
};
