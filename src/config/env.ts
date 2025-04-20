import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
dotenv.config({ path: path.join(process.cwd(), ".env") });

export const config = {
  // Server
  DOMAIN: process.env.DOMAIN || "atcreations.ca",
  PORT: parseInt(process.env.PORT || "5000", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  IS_PROD: process.env.NODE_ENV === "production",
  API_ROUTES: process.env.API_ROUTES || "/api",
  API_VERSION: process.env.API_VERSION || "/v2",

  // Database
  DATABASE_URL: process.env.DATABASE_URL || "mongodb://localhost:27017",
  DATABASE_NAME: process.env.DATABASE_NAME || "atstore",
  DATABASE_KEY: process.env.DATABASE_KEY,
  DATABASE_APP_NAME: process.env.DATABASE_APP_NAME || "atstore",

  // Redis
  REDIS_HOST: process.env.REDIS_HOST || "localhost",
  REDIS_PORT: parseInt(process.env.REDIS_PORT || "6379", 10),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || "redis_password",
  REDIS_MAXMEMORY: process.env.REDIS_MAXMEMORY || "512mb",
  REDIS_MAXMEMORY_POLICY: process.env.REDIS_MAXMEMORY_POLICY || "allkeys-lru",
  REDIS_AUTH_MAXMEMORY: process.env.REDIS_AUTH_MAXMEMORY || "256mb",
  REDIS_AUTH_MAXMEMORY_POLICY:
    process.env.REDIS_MAXMEMORY_POLICY || "allkeys-lru",

  // Rate Limiter
  RATE_LIMIT_POINTS: parseInt(process.env.RATE_LIMIT_POINTS || "60", 10),
  RATE_LIMIT_DURATION: parseInt(process.env.RATE_LIMIT_DURATION || "60", 10),
  TRUSTED_PROXIES: process.env.TRUSTED_PROXIES === "true",

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || "secret",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "refresh_secret",

  // Cookies
  COOKIE_SECRET: process.env.COOKIE_SECRET || "cookie_secret",

  // CSRF
  CSRF_SECRET: process.env.CSRF_SECRET || "csrf_secret",

  // Security
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(",") || [
    "http://localhost:3000",
  ],
  NO_ORIGIN: process.env.NO_ORIGIN === "1",
  REGISTER_SECRET: process.env.REGISTER_SECRET,

  // Storage (R2)
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_URL: process.env.R2_URL,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,

  // Email
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM || "no-reply@atcreations.ca",

  // CDN
  CDN_URL: process.env.CDN_URL,

  // Frontend URL for email links
  FRONTEND_URL: process.env.FRONTEND_URL || "https://atcreations.ca",
  ADMIN_PAGE_URL: process.env.ADMIN_PAGE_URL || "https://admin.atcreations.ca",

  // Logo for emails
  LOGO_URL: process.env.LOGO_URL || "",

  // Email
  EMAIL_DOMAIN: process.env.EMAIL_DOMAIN || "atcreations.ca",

  // Store name
  STORE_NAME: process.env.STORE_NAME || "AT Creations",

  // App API Secret
  APP_API_SECRET: process.env.APP_API_SECRET as string,

  // Gemini API Key
  GEMINI_API_KEY: process.env.GEMINI_API_KEY as string,
};

export default config;
