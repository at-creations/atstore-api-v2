import cors from "cors";
import { Request, Response, NextFunction } from "express";
import config from "../config/env";

/**
 * Configure CORS options based on environment variables
 */
export const configureCors = () => {
  const corsOptions = {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin && config.NO_ORIGIN) {
        return callback(null, true);
      }

      // Special case: allow all origins
      if (config.ALLOWED_ORIGINS.includes("*")) {
        return callback(null, true);
      }

      // Special case: disallow all origins
      if (
        config.ALLOWED_ORIGINS.includes("none") ||
        config.ALLOWED_ORIGINS.length === 0
      ) {
        return callback(new Error("CORS not allowed"), false);
      }

      // Check against allowed origins
      if (origin && config.ALLOWED_ORIGINS.indexOf(origin) !== -1) {
        return callback(null, true);
      } else {
        return callback(new Error("CORS not allowed"), false);
      }
    },
    credentials: true, // Allow cookies and authentication headers
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Access-Control-Allow-Headers",
    ],
    exposedHeaders: ["Content-Disposition"], // Expose headers for file downloads
  };

  return cors(corsOptions);
};

/**
 * Middleware for handling CORS preflight requests
 */
export const handleCorsPreflightRequests = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Handle preflight OPTIONS requests
  if (req.method === "OPTIONS") {
    // Set CORS headers for preflight requests
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, Accept, Origin, Access-Control-Allow-Headers"
    );
    res.header("Access-Control-Max-Age", "86400"); // 24 hours
    res.status(204).end();
    return;
  }
  next();
};
