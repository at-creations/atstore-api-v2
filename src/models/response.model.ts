/**
 * Standard API response structure
 */
export interface ApiResponse<T> {
  /**
   * Success status of the operation
   */
  success: boolean;

  /**
   * Message describing the result of the operation
   */
  message: string;

  /**
   * Optional data payload
   */
  data?: T;

  /**
   * Optional metadata (pagination info, counts, etc.)
   */
  metadata?: ResponseMetadata;
}

/**
 * Metadata for responses (typically used for pagination, statistics, etc.)
 */
export interface ResponseMetadata {
  /**
   * Total count of items (for pagination)
   */
  totalCount?: number;

  /**
   * Current page number
   */
  page?: number;

  /**
   * Number of items per page
   */
  pageSize?: number;

  /**
   * Total number of pages
   */
  totalPages?: number;

  /**
   * Any additional metadata fields
   */
  [key: string]: any;
}

/**
 * Create a successful response
 * @param message Success message
 * @param data Optional data payload
 * @param metadata Optional metadata
 */
export const successResponse = <T>(
  message: string,
  data?: T,
  metadata?: ResponseMetadata,
): ApiResponse<T> => {
  return {
    success: true,
    message,
    data,
    metadata,
  };
};

/**
 * Create an error response
 * @param message Error message
 * @param metadata Optional metadata
 */
export const errorResponse = (
  message: string,
  metadata?: ResponseMetadata,
): ApiResponse<null> => {
  return {
    success: false,
    message,
    data: undefined,
    metadata,
  };
};

/**
 * Create a paginated response
 * @param message Success message
 * @param data Data payload
 * @param page Current page number
 * @param pageSize Items per page
 * @param totalCount Total number of items
 * @param additionalMetadata Additional metadata
 */
export const paginatedResponse = <T>(
  message: string,
  data: T,
  page: number,
  pageSize: number,
  totalCount: number,
  additionalMetadata: Record<string, any> = {},
): ApiResponse<T> => {
  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    success: true,
    message,
    data,
    metadata: {
      page,
      pageSize,
      totalCount,
      totalPages,
      ...additionalMetadata,
    },
  };
};
