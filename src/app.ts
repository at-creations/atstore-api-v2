import express, { Express } from "express";
import { config } from "./config/env";
import helmet from "helmet";
import {
  configureCors,
  handleCorsPreflightRequests,
} from "./middleware/cors.middleware";
import { connectToDatabase, disconnectFromDatabase } from "./config/database";
import http from "http";
import cookieParser from "cookie-parser";
import {
  errorMiddleware,
  notFoundHandler,
} from "./middleware/error.middleware";

import apiRoutes from "./routes/api.routes";
import { getHealthStatus } from "./controllers/health.controller";
import {
  MediaCleanSchedulerService,
  ProductViewSchedulerService,
} from "./services/scheduler.service";
import { disconnectRedis, testRedisConnection } from "./config/redis";
import { rateLimiter } from "./middleware/rate-limit.middleware";
import {
  csrfProtection,
  generateCsrfTokenHandler,
} from "./middleware/csrf.middleware"; // Import CSRF middleware

const app: Express = express();
const PORT: number = config.PORT;
const API_ROUTES = config.API_ROUTES;
const API_VERSION = config.API_VERSION;

// Quick health-check endpoint before any middleware
// This ensures Docker health checks aren't impacted by middleware processing
app.get(`${API_ROUTES}${API_VERSION}/health`, getHealthStatus);

// Security middleware
app.use(helmet());
app.use(handleCorsPreflightRequests); // Handle OPTIONS requests first
app.use(configureCors()); // Apply CORS with config from environment

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(config.COOKIE_SECRET));

// CSRF token endpoint - clients call this to get a token
app.get(`${API_ROUTES}${API_VERSION}/csrf-token`, generateCsrfTokenHandler);

// Apply global rate limiter to all API routes except health check and CSRF token
app.use(`${API_ROUTES}${API_VERSION}`, (req, res, next) => {
  if (req.path === "/health" || req.path === "/csrf-token") {
    return next();
  }
  return rateLimiter(req, res, next);
});

// Apply CSRF protection to all API routes
// This must come AFTER cookie parser but BEFORE routes
app.use(`${API_ROUTES}${API_VERSION}`, csrfProtection);

// Routes
app.use(`${API_ROUTES}${API_VERSION}`, apiRoutes); // API routes

// Error handling - these should be last
app.use(notFoundHandler); // Handle 404 errors
app.use(errorMiddleware); // Global error handler

// Create HTTP server
const server = http.createServer(app);

// Track connections
let connections: Record<string, any> = {};
let connectionCounter = 0;

server.on("connection", (connection) => {
  const id = connectionCounter++;
  connections[id] = connection;

  connection.on("close", () => {
    delete connections[id];
  });
});

// Graceful shutdown function
const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    console.log("HTTP server closed");
  });

  // Close all existing connections
  Object.values(connections).forEach((connection: any) => {
    connection.end();
  });

  try {
    // Perform database and Redis disconnections in parallel
    await Promise.all([
      disconnectFromDatabase().catch((error) => {
        console.error("Error disconnecting from MongoDB:", error);
      }),
      disconnectRedis().catch((error) => {
        console.error("Error disconnecting from Redis:", error);
      }),
    ]);

    console.log("All services disconnected successfully");
  } catch (error) {
    console.error("Error during shutdown:", error);
  }

  // Exit process
  console.log("Graceful shutdown completed");
  process.exit(0);
};

// Register shutdown handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

const startServer = async () => {
  try {
    await connectToDatabase();
    await testRedisConnection();

    // Initialize scheduled tasks
    MediaCleanSchedulerService.initScheduledTasks();
    ProductViewSchedulerService.initScheduledTasks();

    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Error starting server: ", error);
    process.exit(1);
  }
};

startServer();

export default app;
