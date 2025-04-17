import { Request, Response } from "express";
import { successResponse } from "../models/response.model";
import { asyncHandler } from "../utils/async-handler.util";
import mongoose from "mongoose";
import axios from "axios";
import config from "../config/env";

/**
 * Basic health check endpoint
 * Returns application status and version
 */
export const getHealthStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const status = {
      status: "UP",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV,
      database: {
        status:
          mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      },
      memory: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
      },
      uptime: `${Math.floor(process.uptime())} seconds`,
    };

    return res
      .status(200)
      .json(successResponse("Service health check", status));
  }
);

/**
 * Detailed health check that verifies all system components
 * Checks database connectivity and other vital services
 */
export const getDetailedHealth = asyncHandler(
  async (req: Request, res: Response) => {
    // Database check
    const dbStatus = {
      status: mongoose.connection.readyState === 1 ? "UP" : "DOWN",
      responseTime: 0,
    };

    // Measure database response time - without requiring admin privileges
    if (dbStatus.status === "UP" && mongoose.connection.db) {
      const startTime = Date.now();
      try {
        await mongoose.connection.db.command({ ping: 1 });

        dbStatus.responseTime = Date.now() - startTime;
      } catch (error) {
        console.error("Database health check failed:", error);
        dbStatus.status = "DOWN";
      }
    } else if (dbStatus.status === "UP") {
      // Connection appears up but db is not available
      dbStatus.status = "DEGRADED";
    }

    // System information
    const systemInfo = {
      status: dbStatus.status === "UP" ? "UP" : "DEGRADED",
      database: dbStatus,
      memory: {
        free: `${Math.round((process.memoryUsage().heapTotal - process.memoryUsage().heapUsed) / 1024 / 1024)} MB`,
        heap: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
      },
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
    };

    return res
      .status(200)
      .json(successResponse("Detailed health status", systemInfo));
  }
);
