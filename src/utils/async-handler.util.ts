import { Request, Response, NextFunction } from "express";

/**
 * Wraps controller functions to catch errors and forward them to Express error handler
 * Eliminates the need for try/catch blocks in every controller
 *
 * @param fn Controller function to wrap
 * @returns Wrapped controller that forwards errors to next()
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
