import { Request, Response } from "express";
import { successResponse, paginatedResponse } from "../models/response.model";
import { asyncHandler } from "../utils/async-handler.util";
import { BadRequestError } from "../middleware/error.middleware";
import { CategoryService } from "../services/category.service";
import {
  cacheRedisUtils,
  REDIS_CACHE_KEYS,
  CACHE_EXPIRY,
} from "../utils/redis.utils";

/**
 * Create a new category
 */
export const createCategory = asyncHandler(
  async (req: Request, res: Response) => {
    // Check if name exists
    if (!req.body.name) {
      throw new BadRequestError("Category name is required");
    }

    const category = await CategoryService.createCategory(req.body);

    // Invalidate category list cache after creating a new category
    await cacheRedisUtils.delByPattern(REDIS_CACHE_KEYS.CAT.ALL);

    return res
      .status(201)
      .json(successResponse("Category created successfully", category));
  }
);

/**
 * Get a category by ID or slug
 */
export const getCategoryByIdOrSlug = asyncHandler(
  async (req: Request, res: Response) => {
    const { idOrSlug } = req.params;
    const cacheKey = `${REDIS_CACHE_KEYS.CAT.DET}${idOrSlug}`;

    let category;

    // Check if we should bypass cache based on the bypassCache flag set in middleware
    if (!req.bypassCache) {
      // Try to get from cache first
      category = await cacheRedisUtils.get(cacheKey);
    }

    if (!category) {
      // Not in cache or cache bypass is active, fetch from database
      category = await CategoryService.findCategoryByIdOrSlug(idOrSlug);

      // Store in cache only if we're not bypassing cache
      if (category && !req.bypassCache) {
        await cacheRedisUtils.set(cacheKey, category, CACHE_EXPIRY.MEDIUM);
      }
    }

    return res
      .status(200)
      .json(successResponse("Category retrieved successfully", category));
  }
);

/**
 * Search categories with filtering, sorting and pagination
 */
export const searchCategories = asyncHandler(
  async (req: Request, res: Response) => {
    // Parse query parameters
    const search = (req.query.search as string) || "";

    const sort = (req.query.sort as string) || "name";
    const order = (req.query.order as string) || "asc";
    const validSortFields = ["name", "createdAt", "updatedAt"];
    const validOrderFields = ["asc", "desc"];
    if (!validSortFields.includes(sort)) {
      throw new BadRequestError(
        `Invalid sort field. Valid fields are: ${validSortFields.join(", ")}`
      );
    }
    if (!validOrderFields.includes(order)) {
      throw new BadRequestError(
        `Invalid sort order. Valid orders are: ${validOrderFields.join(", ")}`
      );
    }

    // Pagination
    const pageSize =
      parseInt((req.query.limit || req.query.pageSize) as string) || 10;
    const page = parseInt(req.query.page as string) || 1;

    // Create cache key based on search parameters
    const cacheKey = `${REDIS_CACHE_KEYS.CAT.LST}${search}_${sort}_${order}_${page}_${pageSize}`;

    let result;

    // Check if we should bypass cache based on the bypassCache flag set in middleware
    if (!req.bypassCache) {
      // Try to get from cache first
      result = await cacheRedisUtils.get<{
        categories: any[];
        totalCount: number;
      }>(cacheKey);
    }

    if (!result) {
      // Not in cache or cache bypass is active, fetch from database
      result = await CategoryService.searchCategories({
        search,
        sort,
        order,
        page,
        pageSize,
      });

      // Store in cache only if we're not bypassing cache
      if (!req.bypassCache) {
        await cacheRedisUtils.set(cacheKey, result, CACHE_EXPIRY.SHORT);
      }
    }

    const { categories, totalCount } = result;

    return res.status(200).json(
      paginatedResponse(
        "Categories retrieved successfully",
        categories,
        page,
        pageSize,
        totalCount,
        {
          search: search || undefined,
          sortedBy: sort || "name",
          sortOrder: order === "desc" ? "desc" : "asc",
        }
      )
    );
  }
);

/**
 * Update a category
 */
export const updateCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updatedCategory = await CategoryService.updateCategory(id, req.body);

    // Invalidate both specific category cache and list caches
    await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.CAT.DET}${id}`);

    // Also delete cache entry by slug if available in the updated category
    if (updatedCategory && updatedCategory.slug) {
      await cacheRedisUtils.del(
        `${REDIS_CACHE_KEYS.CAT.DET}${updatedCategory.slug}`
      );
    }

    // Invalidate all category list caches
    await cacheRedisUtils.delByPattern(REDIS_CACHE_KEYS.CAT.LST + "*");

    return res
      .status(200)
      .json(successResponse("Category updated successfully", updatedCategory));
  }
);

/**
 * Delete a category
 */
export const deleteCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Get the category first to have the slug for cache invalidation
    const category = await CategoryService.findCategoryByIdOrSlug(id);

    await CategoryService.deleteCategory(id);

    // Invalidate both specific category cache and list caches
    await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.CAT.DET}${id}`);

    // Also delete cache entry by slug if available
    if (category && category.slug) {
      await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.CAT.DET}${category.slug}`);
    }

    // Invalidate all category list caches
    await cacheRedisUtils.delByPattern(REDIS_CACHE_KEYS.CAT.LST + "*");

    return res
      .status(200)
      .json(successResponse("Category deleted successfully"));
  }
);

/**
 * Bulk create multiple categories
 */
export const bulkCreateCategories = asyncHandler(
  async (req: Request, res: Response) => {
    const categoriesData = req.body;

    // Validate request body
    if (!Array.isArray(categoriesData)) {
      throw new BadRequestError("Request body must be an array of categories");
    }

    if (categoriesData.length === 0) {
      throw new BadRequestError("At least one category is required");
    }

    // Enforce maximum limit of 20 categories per request
    if (categoriesData.length > 20) {
      throw new BadRequestError(
        "Maximum of 20 categories can be created in a single request"
      );
    }

    // Create categories using service
    const createdCategories =
      await CategoryService.bulkCreateCategories(categoriesData);

    // Invalidate all category caches since we've added multiple entries
    await cacheRedisUtils.delByPattern(REDIS_CACHE_KEYS.CAT.ALL);

    return res
      .status(201)
      .json(
        successResponse(
          `Successfully created ${createdCategories.length} categories`,
          createdCategories
        )
      );
  }
);
