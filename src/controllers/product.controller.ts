import { Request, Response } from "express";
import { successResponse, paginatedResponse } from "../models/response.model";
import { asyncHandler } from "../utils/async-handler.util";
import { BadRequestError } from "../middleware/error.middleware";
import { ProductService } from "../services/product.service";
import {
  cacheRedisUtils,
  REDIS_CACHE_KEYS,
  CACHE_EXPIRY,
} from "../utils/redis.utils";

/**
 * Create a new product
 */
export const createProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const product = await ProductService.createProduct(req.body);

    // Invalidate product cache after creating a new product
    await cacheRedisUtils.delByPattern(REDIS_CACHE_KEYS.PRD.ALL);

    return res
      .status(201)
      .json(successResponse("Product created successfully", product));
  }
);

/**
 * Get a product by ID
 */
export const getProductById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const cacheKey = `${REDIS_CACHE_KEYS.PRD.DET}${id}`;

    let product;

    // Check if we should bypass cache based on the bypassCache flag set in middleware
    if (!req.bypassCache) {
      // Try to get from cache first
      product = await cacheRedisUtils.get(cacheKey);
    }

    if (!product) {
      // Not in cache or cache bypass is active, fetch from database
      product = await ProductService.getProductById(id);

      // Store in cache only if we're not bypassing cache
      if (product && !req.bypassCache) {
        await cacheRedisUtils.set(cacheKey, product, CACHE_EXPIRY.MEDIUM);
      }
    }

    return res
      .status(200)
      .json(successResponse("Product retrieved successfully", product));
  }
);

/**
 * Increment product view count
 */
export const incrementProductViews = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Create a properly typed viewData object
    const viewData = {
      userId: req.user?._id?.toString(), // Convert ObjectId to string
      // Use any for sessionId since the session property is not in the base Request type
      sessionId: (req as any).session?.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]?.toString(),
      hostname: req.headers.host?.toString(),
      referrer: req.headers.referer?.toString(),
    };

    await ProductService.incrementProductViews(id, viewData);

    // Invalidate cached product since view count changed
    await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.PRD.DET}${id}`);

    return res
      .status(200)
      .json(successResponse("View count updated"));
  }
);

/**
 * Search products with filtering, sorting and pagination
 */
export const searchProducts = asyncHandler(
  async (req: Request, res: Response) => {
    // Parse query parameters
    const search = (req.query.search as string) || "";
    const minPrice = req.query.minPrice
      ? Number(req.query.minPrice)
      : undefined;
    const maxPrice = req.query.maxPrice
      ? Number(req.query.maxPrice)
      : undefined;

    // Parse categories - handle comma-separated string of category IDs
    let categoryIds: string[] | undefined;
    if (req.query.categories) {
      if (Array.isArray(req.query.categories)) {
        // If somehow it's already an array
        categoryIds = req.query.categories as string[];
      } else {
        // Parse comma-separated string into array
        categoryIds = (req.query.categories as string)
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id);
      }
    }

    // Parse category slugs - handle comma-separated string of category slugs
    let categorySlugs: string[] | undefined;
    if (req.query.categorySlugs) {
      if (Array.isArray(req.query.categorySlugs)) {
        // If somehow it's already an array
        categorySlugs = req.query.categorySlugs as string[];
      } else {
        // Parse comma-separated string into array
        categorySlugs = (req.query.categorySlugs as string)
          .split(",")
          .map((slug) => slug.trim())
          .filter((slug) => slug);
      }
    }

    const featured =
      req.query.featured !== undefined
        ? req.query.featured === "true"
        : undefined;

    const inStock =
      req.query.inStock !== undefined
        ? req.query.inStock === "true"
        : undefined;

    // Parse sort and order
    const sort = req.query.sort as string;
    const order = req.query.order as string;

    // Parse pagination
    const pageSize =
      parseInt((req.query.limit || req.query.pageSize) as string) || 10;
    const page = parseInt(req.query.page as string) || 1;

    // Create cache key based on search parameters
    const cacheKey = `${REDIS_CACHE_KEYS.PRD.LST}${search}_${minPrice || ""}_${maxPrice || ""}_${categoryIds ? categoryIds.join("-") : ""}_${categorySlugs ? categorySlugs.join("-") : ""}_${featured}_${inStock}_${sort}_${order}_${page}_${pageSize}`;

    let result;

    // Check if we should bypass cache based on the bypassCache flag set in middleware
    if (!req.bypassCache) {
      // Try to get from cache first
      result = await cacheRedisUtils.get<{
        products: any[];
        totalCount: number;
      }>(cacheKey);
    }

    if (!result) {
      // Not in cache or cache bypass is active, fetch from database
      result = await ProductService.searchProducts({
        search,
        minPrice,
        maxPrice,
        categoryIds,
        categorySlugs,
        featured,
        inStock,
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

    const { products, totalCount } = result;

    return res.status(200).json(
      paginatedResponse(
        "Products retrieved successfully",
        products,
        page,
        pageSize,
        totalCount,
        {
          search: search || undefined,
          minPrice,
          maxPrice,
          categoryIds,
          categorySlugs,
          featured,
          inStock,
          sortedBy: sort,
          sortOrder: order,
        }
      )
    );
  }
);

/**
 * Update a product
 */
export const updateProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const updatedProduct = await ProductService.updateProduct(id, req.body);

    // Invalidate product cache and list caches
    await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.PRD.DET}${id}`);
    await cacheRedisUtils.delByPattern(REDIS_CACHE_KEYS.PRD.LST + "*");

    return res
      .status(200)
      .json(successResponse("Product updated successfully", updatedProduct));
  }
);

/**
 * Delete a product
 */
export const deleteProduct = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    await ProductService.deleteProduct(id);

    // Invalidate product cache and list caches
    await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.PRD.DET}${id}`);
    await cacheRedisUtils.delByPattern(REDIS_CACHE_KEYS.PRD.LST + "*");

    return res
      .status(200)
      .json(successResponse("Product deleted successfully"));
  }
);

export const bulkDeleteProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const productIds = req.body;

    // Validate request body
    if (!Array.isArray(productIds)) {
      throw new BadRequestError("Request body must be an array of product IDs");
    }

    if (productIds.length === 0) {
      throw new BadRequestError("At least one product ID is required");
    }

    // Delete products using service
    await ProductService.bulkDeleteProducts(productIds);

    // Invalidate cache for each deleted product and all list caches
    for (const id of productIds) {
      await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.PRD.DET}${id}`);
    }
    await cacheRedisUtils.delByPattern(REDIS_CACHE_KEYS.PRD.LST + "*");

    return res
      .status(200)
      .json(successResponse("Products deleted successfully"));
  }
);

/**
 * Bulk create multiple products
 */
export const bulkCreateProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const productsData = req.body;

    // Validate request body
    if (!Array.isArray(productsData)) {
      throw new BadRequestError("Request body must be an array of products");
    }

    if (productsData.length === 0) {
      throw new BadRequestError("At least one product is required");
    }

    // Enforce maximum limit of 50 products per request
    if (productsData.length > 50) {
      throw new BadRequestError(
        "Maximum of 50 products can be created in a single request"
      );
    }

    // Create products using service
    const createdProducts =
      await ProductService.bulkCreateProducts(productsData);

    // Invalidate all product list caches since we've added multiple entries
    await cacheRedisUtils.delByPattern(REDIS_CACHE_KEYS.PRD.LST + "*");

    return res
      .status(201)
      .json(
        successResponse(
          `Successfully created ${createdProducts.length} products`,
          createdProducts
        )
      );
  }
);

/**
 * Get featured products
 */
export const getFeaturedProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 8;
    const cacheKey = `${REDIS_CACHE_KEYS.PRD.LST}featured_${limit}`;

    let products;

    // Check if we should bypass cache based on the bypassCache flag set in middleware
    if (!req.bypassCache) {
      // Try to get from cache first
      products = await cacheRedisUtils.get(cacheKey);
    }

    if (!products) {
      // Not in cache or cache bypass is active, fetch from database
      products = await ProductService.getFeaturedProducts(limit);

      // Store in cache only if we're not bypassing cache
      if (products && !req.bypassCache) {
        await cacheRedisUtils.set(cacheKey, products, CACHE_EXPIRY.MEDIUM);
      }
    }

    return res
      .status(200)
      .json(
        successResponse("Featured products retrieved successfully", products)
      );
  }
);

/**
 * Get most viewed products
 */
export const getMostViewedProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 8;
    const cacheKey = `${REDIS_CACHE_KEYS.PRD.LST}mostviewed_${limit}`;

    let products;

    // Check if we should bypass cache based on the bypassCache flag set in middleware
    if (!req.bypassCache) {
      // Try to get from cache first
      products = await cacheRedisUtils.get(cacheKey);
    }

    if (!products) {
      // Not in cache or cache bypass is active, fetch from database
      products = await ProductService.getMostViewedProducts(limit);

      // Store in cache only if we're not bypassing cache
      if (products && !req.bypassCache) {
        await cacheRedisUtils.set(cacheKey, products, CACHE_EXPIRY.SHORT);
      }
    }

    return res
      .status(200)
      .json(
        successResponse("Popular products retrieved successfully", products)
      );
  }
);

/**
 * Get trending products based on recent views (views in last 7 days)
 */
export const getTrendingProducts = asyncHandler(
  async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 8;
    const cacheKey = `${REDIS_CACHE_KEYS.PRD.LST}trending_${limit}`;

    let products;

    // Check if we should bypass cache
    if (!req.bypassCache) {
      // Try to get from cache first
      products = await cacheRedisUtils.get(cacheKey);
    }

    if (!products) {
      // Not in cache or cache bypass is active, fetch from database
      products = await ProductService.getTrendingProducts(limit);

      // Store in cache only if we're not bypassing cache
      if (products && !req.bypassCache) {
        // Very short expiry for trending products as they change frequently
        await cacheRedisUtils.set(cacheKey, products, CACHE_EXPIRY.VERY_SHORT);
      }
    }

    return res
      .status(200)
      .json(
        successResponse("Trending products retrieved successfully", products)
      );
  }
);

/**
 * Get products by category
 */
export const getProductsByCategory = asyncHandler(
  async (req: Request, res: Response) => {
    const { categoryIdOrSlug } = req.params;
    const pageSize =
      parseInt((req.query.pageSize || req.query.limit) as string) || 20;
    const page = parseInt(req.query.page as string) || 1;

    const cacheKey = `${REDIS_CACHE_KEYS.PRD.LST}cat_${categoryIdOrSlug}_${page}_${pageSize}`;

    let products;

    // Check if we should bypass cache based on the bypassCache flag set in middleware
    if (!req.bypassCache) {
      // Try to get from cache first
      products = await cacheRedisUtils.get(cacheKey);
    }

    if (!products) {
      // Not in cache or cache bypass is active, fetch from database
      products = await ProductService.getProductsByCategory(
        categoryIdOrSlug,
        pageSize,
        page
      );

      // Store in cache only if we're not bypassing cache
      if (products && !req.bypassCache) {
        await cacheRedisUtils.set(cacheKey, products, CACHE_EXPIRY.SHORT);
      }
    }

    return res.status(200).json(
      paginatedResponse(
        "Products by category retrieved successfully",
        products.products,
        page,
        pageSize,
        products.totalCount,
        {
          category: products.category,
        }
      )
    );
  }
);

/**
 * Update product stock
 */
export const updateProductStock = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { quantity } = req.body;

    // Validate quantity
    if (quantity === undefined || isNaN(Number(quantity))) {
      throw new BadRequestError("Valid quantity is required");
    }

    const updatedProduct = await ProductService.updateProductStock(
      id,
      Number(quantity)
    );

    // Invalidate product cache and list caches that may include stock info
    await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.PRD.DET}${id}`);

    // Clear specific cached lists that would be affected by stock changes
    await cacheRedisUtils.delByPattern(`${REDIS_CACHE_KEYS.PRD.LST}*inStock*`);

    return res
      .status(200)
      .json(
        successResponse("Product stock updated successfully", updatedProduct)
      );
  }
);

/**
 * Get all product IDs
 */
export const getAllProductIds = asyncHandler(
  async (req: Request, res: Response) => {
    const cacheKey = `${REDIS_CACHE_KEYS.PRD.LST}all_ids`;

    let productIds;

    // Check if we should bypass cache based on the bypassCache flag set in middleware
    if (!req.bypassCache) {
      // Try to get from cache first
      productIds = await cacheRedisUtils.get(cacheKey);
    }

    if (!productIds) {
      // Not in cache or cache bypass is active, fetch from database
      productIds = await ProductService.getAllProductIds();

      // Store in cache only if we're not bypassing cache
      if (productIds && !req.bypassCache) {
        await cacheRedisUtils.set(cacheKey, productIds, CACHE_EXPIRY.LONG);
      }
    }

    return res
      .status(200)
      .json(successResponse("Product IDs retrieved successfully", productIds));
  }
);

/**
 * Manually update recent views count for all products
 * This is an admin-only endpoint to trigger the recalculation
 */
export const updateProductRecentViews = asyncHandler(
  async (_req: Request, res: Response) => {
    const updatedCount = await ProductService.updateRecentViewsCount();

    // Invalidate trending products cache
    await cacheRedisUtils.delByPattern(`${REDIS_CACHE_KEYS.PRD.LST}trending_*`);

    return res
      .status(200)
      .json(
        successResponse(
          `Recent views count updated for ${updatedCount} products`,
          { updatedCount }
        )
      );
  }
);
