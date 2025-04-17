import { Request, Response, NextFunction } from "express";
import config from "../config/env";
import { errorResponse } from "../models/response.model";

class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class BadRequestError extends AppError {
  constructor(message: string = "Bad Request") {
    super(message, 400);
  }
}

class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(message, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404);
  }
}

class DatabaseError extends AppError {
  constructor(message: string = "Database error occurred") {
    super(message, 503);
  }
}

class InternalServerError extends AppError {
  constructor(message: string = "Internal Server Error") {
    super(message, 500);
  }
}

// Global error handler middleware
export const errorMiddleware = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {

  // JWT errors
  if (error.name === "JsonWebTokenError") {
    res.status(401).json(errorResponse("Invalid token"));
    return;
  }
  if (error.name === "TokenExpiredError") {
    res.status(401).json(errorResponse("Token expired"));
    return;
  }
  if (error.name === "NotBeforeError") {
    res.status(401).json(errorResponse("Token not active"));
  }


  // Handle our custom application errors
  if (error instanceof AppError) {
    res
      .status(error.statusCode)
      .json(
        errorResponse(
          error.message,
          config.NODE_ENV === "development" ? { stack: error.stack } : undefined
        )
    );
    return; 
  }

  // Handle any unexpected errors that weren't caught by DbService
  res
    .status(500)
    .json(
      errorResponse(
        "Something went wrong",
        config.NODE_ENV === "development"
          ? { message: error.message, stack: error.stack }
          : undefined
      )
    );
  return;
};

// Not found middleware for undefined routes
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json(errorResponse(`Route ${req.originalUrl} not found`));
  return;
};

export {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  DatabaseError,
  InternalServerError,
};
