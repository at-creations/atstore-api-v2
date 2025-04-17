import mongoose from "mongoose";
import {
  DatabaseError,
  BadRequestError,
  InternalServerError,
  NotFoundError,
  AppError,
} from "../middleware/error.middleware";

export class DbService {
  /**
   * Executes a database operation safely with error handling
   * @param operation Function that performs the database operation
   * @returns Result of the database operation
   * @throws BadRequestError for client errors (validation, format issues)
   * @throws DatabaseError for connection issues
   * @throws InternalServerError for unexpected database errors
   */
  public static async executeDbOperation<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      // Check if MongoDB connection is established
      if (mongoose.connection.readyState !== 1) {
        throw new DatabaseError("Database connection is not established");
      }

      return await operation();
    } catch (error: any) {
      // If we've already created a custom error, just pass it through
      if (
        error instanceof DatabaseError ||
        error instanceof BadRequestError ||
        error instanceof InternalServerError
      ) {
        throw error;
      }

      // Handle client-side errors (400 Bad Request)

      // Validation errors (invalid document format)
      if (error instanceof mongoose.Error.ValidationError) {
        const message = Object.values(error.errors)
          .map((err) => err.message)
          .join("; ");
        throw new BadRequestError(`Validation error: ${message}`);
      }

      // Cast errors (invalid ID format, etc.)
      if (error instanceof mongoose.Error.CastError) {
        throw new BadRequestError(`Invalid ${error.path}: ${error.value}`);
      }

      // Duplicate key errors (unique constraint violations)
      if (error.name === "MongoServerError" && error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        const value = error.keyValue[field];
        throw new BadRequestError(`${field} '${value}' already exists`);
      }

      // Document not found errors (404 Not Found)
      if (error instanceof mongoose.Error.DocumentNotFoundError) {
        throw new NotFoundError(`Document not found: ${error.message}`);
      }

      // Not Found errors (404 Not Found)
      if (error.name === "NotFoundError") {
        throw new NotFoundError(`Not Found: ${error.message}`);
      }

      // Handle connection-related errors (503 Service Unavailable)

      // Network errors
      if (error.name === "MongoNetworkError") {
        throw new DatabaseError(
          "Database network error: Could not connect to the database"
        );
      }

      // Timeout errors
      if (error.name === "MongoTimeoutError") {
        throw new DatabaseError(
          "Database timeout: Operation took too long to complete"
        );
      }

      // General connection issues
      if (
        error.message &&
        (error.message.includes("connection") ||
          error.message.includes("connect") ||
          error.message.includes("timeout"))
      ) {
        throw new DatabaseError(`Database connection issue: ${error.message}`);
      }

      // Handle query errors (internal errors but not connection related)
      if (error.name === "MongoServerError") {
        throw new InternalServerError(`Database query error: ${error.message}`);
      }
      
      // Any other unexpected errors
      throw new AppError(
        error.message || "An unexpected database error occurred",
        error.statusCode || 500
      );
    }
  }

  /**
   * Check if database is connected
   * @returns True if connected, false otherwise
   */
  public static isDatabaseConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }

  /**
   * Get database connection status
   * @returns Connection status details
   */
  public static getDatabaseStatus(): {
    connected: boolean;
    status: string;
    readyState: number;
  } {
    const readyState = mongoose.connection.readyState;
    let status = "unknown";

    switch (readyState) {
      case 0:
        status = "disconnected";
        break;
      case 1:
        status = "connected";
        break;
      case 2:
        status = "connecting";
        break;
      case 3:
        status = "disconnecting";
        break;
      case 99:
        status = "uninitialized";
        break;
    }

    return {
      connected: readyState === 1,
      status,
      readyState,
    };
  }

  public static isValidObjectId(id: string): boolean {
    return mongoose.Types.ObjectId.isValid(id);
  }
}
