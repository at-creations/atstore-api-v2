import { Product, IProductDocument } from "../models/product.model";
import { Category } from "../models/category.model";
import { ProductView } from "../models/productView.model";
import { BadRequestError, NotFoundError } from "../middleware/error.middleware";
import { DbService } from "./db.service";
import { CategoryService } from "./category.service";

export class ProductService {
  /**
   * Create a new product
   * @param productData Product data to create
   * @returns Created product
   */
  public static async createProduct(
    productData: any
  ): Promise<IProductDocument> {
    return await DbService.executeDbOperation(async () => {
      // Validate required fields
      if (!productData.name) {
        throw new BadRequestError("Product name is required");
      }

      if (!productData.description) {
        throw new BadRequestError("Product description is required");
      }

      if (productData.price === undefined || isNaN(Number(productData.price))) {
        throw new BadRequestError("Valid product price is required");
      }

      // Validate categories if provided
      if (productData.categoryIds && productData.categoryIds.length > 0) {
        if (!Array.isArray(productData.categoryIds)) {
          throw new BadRequestError("Categories must be an array");
        }

        // Validate each category ID format
        for (const categoryId of productData.categoryIds) {
          if (!DbService.isValidObjectId(categoryId)) {
            throw new BadRequestError(
              `Invalid category ID format: ${categoryId}`
            );
          }
        }

        // Verify all category IDs exist in database
        const existingCategories = await Category.find({
          _id: { $in: productData.categoryIds },
        })
          .select("_id")
          .lean();

        if (existingCategories.length !== productData.categoryIds.length) {
          // Find which category IDs don't exist
          const existingCategoryIds = existingCategories.map((c) =>
            c._id.toString()
          );
          const nonExistentIds: string[] = productData.categoryIds.filter(
            (id: string) => !existingCategoryIds.includes(id.toString())
          );

          throw new BadRequestError(
            `The following categories do not exist: ${nonExistentIds.join(", ")}`
          );
        }
      }

      // Create and save product
      const product = new Product(productData);
      await product.save();
      return product;
    });
  }

  /**
   * Get product by ID
   * @param id Product ID
   * @returns Product document with category details
   */
  public static async getProductById(id: string): Promise<any> {
    if (!DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid product ID");
    }

    return await DbService.executeDbOperation(async () => {
      const product = await Product.findById(id).select("-__v").lean();

      if (!product) {
        throw new NotFoundError("Product not found");
      }

      let productCategories: any[] = [];

      // Add category details if product has categoryIds
      if (product.categoryIds && product.categoryIds.length > 0) {
        const categories = await Category.find({
          _id: { $in: product.categoryIds },
        })
          .select("_id name nameVI slug thumbnail")
          .lean();

        // Add categories to product
        productCategories = categories;
      }

      return {
        ...product,
        categories: productCategories,
      };
    });
  }

  /**
   * Update product views counter
   * @param id Product ID
   * @param viewData Additional data about the view event
   * @returns Updated views count
   */
  public static async incrementProductViews(
    id: string,
    viewData?: {
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      hostname?: string;
      referrer?: string;
    }
  ): Promise<number> {
    if (!DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid product ID");
    }

    return await DbService.executeDbOperation(async () => {
      // Check for existing views in the last 15 minutes from the same IP and browser
      const fifteenMinutesAgo = new Date();
      fifteenMinutesAgo.setMinutes(fifteenMinutesAgo.getMinutes() - 15);

      // Construct filter to find recent view from same IP and browser for this product
      const recentViewFilter: any = {
        productId: id,
        timestamp: { $gte: fifteenMinutesAgo },
      };

      // Add IP address and user agent to filter if available
      if (viewData?.ipAddress) {
        recentViewFilter.ipAddress = viewData.ipAddress;
      }

      if (viewData?.userAgent) {
        recentViewFilter.userAgent = viewData.userAgent;
      }

      // Check for recent view
      const recentView = await ProductView.findOne(recentViewFilter);

      // If a recent view exists, don't increment and return current view count
      if (recentView) {
        const product = await Product.findById(id);
        if (!product) {
          throw new NotFoundError("Product not found");
        }
        return product.views;
      }

      // Increment the total views on the product
      const product = await Product.findByIdAndUpdate(
        id,
        { $inc: { views: 1 } },
        { new: true }
      );

      if (!product) {
        throw new NotFoundError("Product not found");
      }

      // Record individual view event with timestamp in ProductView collection
      const productView = new ProductView({
        productId: id,
        userId: viewData?.userId,
        sessionId: viewData?.sessionId,
        ipAddress: viewData?.ipAddress,
        userAgent: viewData?.userAgent,
        hostname: viewData?.hostname,
        referrer: viewData?.referrer,
        timestamp: new Date(),
      });

      await productView.save();

      return product.views;
    });
  }

  /**
   * Search products with filtering, sorting and pagination
   * @param params Search parameters
   * @returns Products with category details and total count
   */
  public static async searchProducts(params: {
    search?: string;
    minPrice?: number;
    maxPrice?: number;
    categoryIds?: string[];
    categorySlugs?: string[];
    featured?: boolean;
    inStock?: boolean;
    sort?: string;
    order?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ products: any[]; totalCount: number }> {
    const {
      search = "",
      minPrice,
      maxPrice,
      categoryIds,
      categorySlugs,
      featured,
      inStock,
      sort = "default",
      order = "desc",
      page = 1,
      pageSize = 10,
    } = params;

    // Validate and process category filtering
    let resolvedCategoryIds: string[] = [];

    // Process provided category IDs
    if (categoryIds && categoryIds.length > 0) {
      for (const categoryId of categoryIds) {
        if (!DbService.isValidObjectId(categoryId)) {
          throw new BadRequestError(`Invalid category ID: ${categoryId}`);
        }
      }
      resolvedCategoryIds = resolvedCategoryIds.concat(categoryIds);
    }

    // Convert category slugs to IDs if provided
    if (categorySlugs && categorySlugs.length > 0) {
      try {
        const slugIds = await CategoryService.convertToIds(categorySlugs);
        resolvedCategoryIds = resolvedCategoryIds.concat(slugIds);
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw error; // Re-throw not found errors
        }
        throw new BadRequestError(
          `Error processing category slugs: ${(error as Error).message}`
        );
      }
    }

    const skip = (page - 1) * pageSize;

    // Build filter
    const filter: Record<string, any> = {};

    // Price range filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) filter.price.$gte = minPrice;
      if (maxPrice !== undefined) filter.price.$lte = maxPrice;
    }

    // Categories filter
    if (resolvedCategoryIds.length > 0) {
      filter.categoryIds = { $in: resolvedCategoryIds };
    }

    // Featured filter
    if (featured !== undefined) {
      filter.featured = featured;
    }

    // Stock filter
    if (inStock !== undefined) {
      filter.stock = inStock ? { $gt: 0 } : 0;
    }

    // Text search
    if (search) {
      // Escape special regex characters to prevent injection
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { nameVI: { $regex: escapedSearch, $options: "i" } },
        { normalizedNameVI: { $regex: escapedSearch, $options: "i" } },
        { description: { $regex: escapedSearch, $options: "i" } },
        { descriptionVI: { $regex: escapedSearch, $options: "i" } },
        { normalizedDescriptionVI: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    // Create sort object
    const sortOptions: Record<string, 1 | -1> = {};

    // Handle default sorting or explicit "default" sort parameter
    if (!sort || sort === "default") {
      // Updated default sort order: featured first, then by recent views, then by total views, then by createdAt
      sortOptions.featured = -1; // Featured products first
      sortOptions.recentViews = -1; // Recently viewed products next
      sortOptions.views = -1; // Then by all-time views
      sortOptions.createdAt = -1; // Most recent last
    } else {
      // Parse comma-separated sort fields and orders
      const sortFields = sort.split(",").map((field) => field.trim());
      const orderValues = order.split(",").map((ord) => ord.trim());

      // Validate and apply each sort field
      const allowedSortFields = [
        "name",
        "nameVI",
        "normalizedNameVI",
        "price",
        "createdAt",
        "views",
        "recentViews",
        "stock",
        "featured",
      ];

      sortFields.forEach((field, index) => {
        if (!allowedSortFields.includes(field)) {
          throw new BadRequestError(
            `Invalid sort field: ${field}. Valid fields are: ${allowedSortFields.join(", ")}`
          );
        }

        // Get the corresponding order value or use the first one as default
        const orderValue = orderValues[index] || orderValues[0] || "desc";
        sortOptions[field] = orderValue === "asc" ? 1 : -1;
      });
    }

    // Execute search with pagination
    return await DbService.executeDbOperation(async () => {
      const [products, totalCount] = await Promise.all([
        Product.find(filter)
          .select("-__v")
          .sort(sortOptions)
          .skip(skip)
          .limit(pageSize)
          .lean(),
        Product.countDocuments(filter),
      ]);

      // Get unique category IDs from all products
      const allCategoryIds = new Set<string>();
      products.forEach((product) => {
        if (product.categoryIds && product.categoryIds.length > 0) {
          product.categoryIds.forEach((catId: string) =>
            allCategoryIds.add(catId.toString())
          );
        }
      });

      // Fetch all categories in one query
      let categoriesMap: Record<string, any> = {};
      if (allCategoryIds.size > 0) {
        const categories = await Category.find({
          _id: { $in: Array.from(allCategoryIds) },
        })
          .select("_id name nameVI slug thumbnail")
          .lean();

        // Create a map for fast lookup
        categoriesMap = categories.reduce(
          (map, category) => {
            map[category._id.toString()] = category;
            return map;
          },
          {} as Record<string, any>
        );
      }

      // Add category details to each product
      const productsWithCategories = products.map((product) => {
        const productCategories = (product.categoryIds || [])
          .map((catId: string) => categoriesMap[catId.toString()])
          .filter(Boolean); // Filter out any undefined values

        return {
          ...product,
          categories: productCategories,
        };
      });

      return { products: productsWithCategories, totalCount };
    });
  }

  /**
   * Update a product by ID
   * @param id Product ID
   * @param updateData Data to update
   * @returns Updated product
   */
  public static async updateProduct(id: string, updateData: any): Promise<any> {
    if (!DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid product ID");
    }

    // Validate categories if provided
    if (updateData.categoryIds) {
      if (!Array.isArray(updateData.categoryIds)) {
        throw new BadRequestError("categoryIds must be an array");
      }

      // Validate each category ID format
      for (const categoryId of updateData.categoryIds) {
        if (!DbService.isValidObjectId(categoryId)) {
          throw new BadRequestError(
            `Invalid category ID format: ${categoryId}`
          );
        }
      }

      // Verify all category IDs exist in database
      const existingCategories = await Category.find({
        _id: { $in: updateData.categoryIds },
      })
        .select("_id")
        .lean();

      if (existingCategories.length !== updateData.categoryIds.length) {
        // Find which category IDs don't exist
        const existingCategoryIds = existingCategories.map((c) =>
          c._id.toString()
        );
        const nonExistentIds = updateData.categoryIds.filter(
          (id: string) => !existingCategoryIds.includes(id.toString())
        );

        throw new BadRequestError(
          `The following categories do not exist: ${nonExistentIds.join(", ")}`
        );
      }
    }

    return await DbService.executeDbOperation(async () => {
      // Prevent views from being directly updated
      if (updateData.views !== undefined) {
        delete updateData.views;
      }

      const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      })
        .select("-__v")
        .lean();

      if (!updatedProduct) {
        throw new NotFoundError("Product not found");
      }

      return updatedProduct;
    });
  }

  /**
   * Delete a product
   * @param id Product ID
   */
  public static async deleteProduct(id: string): Promise<any> {
    if (!DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid product ID");
    }

    return await DbService.executeDbOperation(async () => {
      const deletedProduct = await Product.findByIdAndDelete(id).select("-__v");

      if (!deletedProduct) {
        throw new NotFoundError("Product not found");
      }

      return deletedProduct;
    });
  }

  /**
   * Bulk delete products by IDs
   * @param ids Array of product IDs
   */
  public static async bulkDeleteProducts(ids: string[]): Promise<any> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestError("Product IDs must be a non-empty array");
    }

    // Validate each ID format
    for (const id of ids) {
      if (!DbService.isValidObjectId(id)) {
        throw new BadRequestError(`Invalid product ID format: ${id}`);
      }
    }

    return await DbService.executeDbOperation(async () => {
      const deletedProducts = await Product.deleteMany({
        _id: { $in: ids },
      }).select("-__v");

      return deletedProducts;
    });
  }

  /**
   * Bulk create multiple products
   * @param productsData Array of product data
   * @returns Created products
   */
  public static async bulkCreateProducts(
    productsData: any[]
  ): Promise<IProductDocument[]> {
    // Validate input
    if (!Array.isArray(productsData) || productsData.length === 0) {
      throw new BadRequestError("Products data must be a non-empty array");
    }

    // Limit batch size for performance
    if (productsData.length > 50) {
      throw new BadRequestError(
        "Maximum of 50 products can be created in a single request"
      );
    }

    // First pass validation - check required fields and category ID formats
    for (const product of productsData) {
      if (!product.name) {
        throw new BadRequestError("Each product must have a name");
      }
      if (!product.description) {
        throw new BadRequestError("Each product must have a description");
      }
      if (product.price === undefined || isNaN(Number(product.price))) {
        throw new BadRequestError("Each product must have a valid price");
      }

      // Validate categories format if provided
      if (product.categoryIds) {
        if (!Array.isArray(product.categoryIds)) {
          throw new BadRequestError("Categories must be an array");
        }

        // Validate each category ID format
        for (const categoryId of product.categoryIds) {
          if (!DbService.isValidObjectId(categoryId)) {
            throw new BadRequestError(
              `Invalid category ID format: ${categoryId}`
            );
          }
        }
      }
    }

    // Collect all category IDs to validate existence in one database query
    const allCategoryIds = new Set<string>();
    productsData.forEach((product) => {
      if (product.categoryIds && product.categoryIds.length > 0) {
        product.categoryIds.forEach((id: string) => {
          allCategoryIds.add(id.toString());
        });
      }
    });

    // Check all category IDs exist (if any)
    if (allCategoryIds.size > 0) {
      const categoryIdsArray = Array.from(allCategoryIds);
      const existingCategories = await Category.find({
        _id: { $in: categoryIdsArray },
      })
        .select("_id")
        .lean();

      if (existingCategories.length !== categoryIdsArray.length) {
        // Find which category IDs don't exist
        const existingCategoryIds = existingCategories.map((c) =>
          c._id.toString()
        );
        const nonExistentIds = categoryIdsArray.filter(
          (id) => !existingCategoryIds.includes(id)
        );

        throw new BadRequestError(
          `The following categories do not exist: ${nonExistentIds.join(", ")}`
        );
      }
    }

    return await DbService.executeDbOperation(async () => {
      // Create an array of promises for each product creation
      const productPromises = productsData.map(async (productData) => {
        const product = new Product(productData);
        await product.save();
        return product;
      });

      // Execute all product creation operations in parallel
      const createdProducts = await Promise.all(productPromises);
      return createdProducts;
    });
  }

  /**
   * Get featured products
   * @param limit Maximum number of products to return
   * @returns Array of featured products with category details
   */
  public static async getFeaturedProducts(limit: number = 8): Promise<any[]> {
    return await DbService.executeDbOperation(async () => {
      const products = await Product.find({ featured: true })
        .select("-__v")
        .sort({ views: -1 })
        .limit(limit)
        .lean();

      // Get unique category IDs
      const allCategoryIds = new Set<string>();
      products.forEach((product) => {
        if (product.categoryIds && product.categoryIds.length > 0) {
          product.categoryIds.forEach((catId: string) =>
            allCategoryIds.add(catId.toString())
          );
        }
      });

      // Fetch all required categories in a single query
      let categoriesMap: Record<string, any> = {};
      if (allCategoryIds.size > 0) {
        const categories = await Category.find({
          _id: { $in: Array.from(allCategoryIds) },
        })
          .select("_id name nameVI slug thumbnail")
          .lean();

        categoriesMap = categories.reduce(
          (map, category) => {
            map[category._id.toString()] = category;
            return map;
          },
          {} as Record<string, any>
        );
      }

      // Add categories to products
      return products.map((product) => {
        const productCategories = (product.categoryIds || [])
          .map((catId: string) => categoriesMap[catId.toString()])
          .filter(Boolean);

        return {
          ...product,
          categories: productCategories,
        };
      });
    });
  }

  /**
   * Get most viewed products
   * @param limit Maximum number of products to return
   * @returns Array of most viewed products with category details
   */
  public static async getMostViewedProducts(limit: number = 8): Promise<any[]> {
    return await DbService.executeDbOperation(async () => {
      const products = await Product.find({ stock: { $gt: 0 } })
        .select("-__v")
        .sort({ views: -1 })
        .limit(limit)
        .lean();

      // Get unique category IDs
      const allCategoryIds = new Set<string>();
      products.forEach((product) => {
        if (product.categoryIds && product.categoryIds.length > 0) {
          product.categoryIds.forEach((catId: string) =>
            allCategoryIds.add(catId.toString())
          );
        }
      });

      // Fetch all categories in a single query
      let categoriesMap: Record<string, any> = {};
      if (allCategoryIds.size > 0) {
        const categories = await Category.find({
          _id: { $in: Array.from(allCategoryIds) },
        })
          .select("_id name nameVI slug thumbnail")
          .lean();

        categoriesMap = categories.reduce(
          (map, category) => {
            map[category._id.toString()] = category;
            return map;
          },
          {} as Record<string, any>
        );
      }

      // Add categories to products
      return products.map((product) => {
        const productCategories = (product.categoryIds || [])
          .map((catId: string) => categoriesMap[catId.toString()])
          .filter(Boolean);

        return {
          ...product,
          categories: productCategories,
        };
      });
    });
  }

  /**
   * Get trending products based on recent views (views in last 7 days)
   * @param limit Maximum number of products to return
   * @returns Array of trending products with category details
   */
  public static async getTrendingProducts(limit: number = 8): Promise<any[]> {
    return await DbService.executeDbOperation(async () => {
      const products = await Product.find({ stock: { $gt: 0 } })
        .select("-__v")
        .sort({ recentViews: -1, views: -1 })
        .limit(limit)
        .lean();

      // Get unique category IDs
      const allCategoryIds = new Set<string>();
      products.forEach((product) => {
        if (product.categoryIds && product.categoryIds.length > 0) {
          product.categoryIds.forEach((catId: string) =>
            allCategoryIds.add(catId.toString())
          );
        }
      });

      // Fetch all categories in a single query
      let categoriesMap: Record<string, any> = {};
      if (allCategoryIds.size > 0) {
        const categories = await Category.find({
          _id: { $in: Array.from(allCategoryIds) },
        })
          .select("_id name nameVI slug thumbnail")
          .lean();

        categoriesMap = categories.reduce(
          (map, category) => {
            map[category._id.toString()] = category;
            return map;
          },
          {} as Record<string, any>
        );
      }

      // Add categories to products
      return products.map((product) => {
        const productCategories = (product.categoryIds || [])
          .map((catId: string) => categoriesMap[catId.toString()])
          .filter(Boolean);

        return {
          ...product,
          categories: productCategories,
        };
      });
    });
  }

  /**
   * Get products by category (using either ID or slug)
   * @param categoryIdentifier Category ID, slug, or "all" (case insensitive to list all products)
   * @param limit Maximum number of products to return
   * @param page Page number
   * @returns Array of products in the category with category details and pagination info
   */
  public static async getProductsByCategory(
    categoryIdentifier: string,
    limit: number = 20,
    page: number = 1
  ): Promise<{ products: any[]; totalCount: number; category: any }> {
    return await DbService.executeDbOperation(async () => {
      // Handle the "all" category case (case insensitive)
      if (categoryIdentifier.toLowerCase() === "all") {
        // Get all products with pagination
        const [products, totalCount] = await Promise.all([
          Product.find({})
            .select("-__v")
            .sort({ featured: -1, recentViews: -1, views: -1, createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .lean(),
          Product.countDocuments({}),
        ]);

        // Get unique category IDs from all products
        const allCategoryIds = new Set<string>();
        products.forEach((product) => {
          if (product.categoryIds && product.categoryIds.length > 0) {
            product.categoryIds.forEach((catId: string) => {
              allCategoryIds.add(catId.toString());
            });
          }
        });

        // Fetch all categories in a single query
        let categoriesMap: Record<string, any> = {};
        if (allCategoryIds.size > 0) {
          const categories = await Category.find({
            _id: { $in: Array.from(allCategoryIds) },
          })
            .select("_id name nameVI slug thumbnail")
            .lean();

          categories.forEach((cat) => {
            categoriesMap[cat._id.toString()] = cat;
          });
        }

        // Add categories to products
        const productsWithCategories = products.map((product) => {
          const productCategories = (product.categoryIds || [])
            .map((catId: string) => categoriesMap[catId.toString()])
            .filter(Boolean);

          return {
            ...product,
            categories: productCategories,
          };
        });

        return {
          products: productsWithCategories,
          totalCount,
          category: {
            name: "All categories",
            nameVI: "Tất cả danh mục",
            slug: "all",
          },
        };
      }

      // Find the category by ID or slug
      let categoryQuery: any;

      if (DbService.isValidObjectId(categoryIdentifier)) {
        categoryQuery = { _id: categoryIdentifier };
      } else {
        // Assume it's a slug if not a valid ObjectId
        categoryQuery = { slug: categoryIdentifier };
      }

      // First, get the category details
      const category = await Category.findOne(categoryQuery)
        .select("_id name nameVI slug thumbnail")
        .lean();

      if (!category) {
        throw new NotFoundError("Category not found");
      }

      const categoryId = category._id.toString();

      // Get products in this category with pagination
      const [products, totalCount] = await Promise.all([
        Product.find({ categoryIds: categoryId })
          .select("-__v")
          .sort({ featured: -1, recentViews: -1, views: -1, createdAt: -1 })
          .limit(limit)
          .skip((page - 1) * limit)
          .lean(),
        Product.countDocuments({ categoryIds: categoryId }),
      ]);

      // Get unique category IDs (excluding the main category)
      const allCategoryIds = new Set<string>();
      products.forEach((product) => {
        if (product.categoryIds && product.categoryIds.length > 0) {
          product.categoryIds.forEach((catId: string) => {
            if (catId.toString() !== categoryId) {
              allCategoryIds.add(catId.toString());
            }
          });
        }
      });

      // Fetch all additional categories
      let categoriesMap: Record<string, any> = { [categoryId]: category };
      if (allCategoryIds.size > 0) {
        const additionalCategories = await Category.find({
          _id: { $in: Array.from(allCategoryIds) },
        })
          .select("_id name nameVI slug thumbnail")
          .lean();

        additionalCategories.forEach((cat) => {
          categoriesMap[cat._id.toString()] = cat;
        });
      }

      // Add categories to products
      const productsWithCategories = products.map((product) => {
        const productCategories = (product.categoryIds || [])
          .map((catId: string) => categoriesMap[catId.toString()])
          .filter(Boolean);

        return {
          ...product,
          categories: productCategories,
        };
      });

      return {
        products: productsWithCategories,
        totalCount,
        category,
      };
    });
  }

  /**
   * Update stock of a product
   * @param id Product ID
   * @param quantity Change in stock quantity (negative for decrement)
   * @returns Updated product with new stock value and category details
   */
  public static async updateProductStock(
    id: string,
    quantity: number
  ): Promise<any> {
    if (!DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid product ID");
    }

    return await DbService.executeDbOperation(async () => {
      // First check if we have enough stock when reducing
      if (quantity < 0) {
        const product = await Product.findById(id);
        if (!product) {
          throw new NotFoundError("Product not found");
        }

        if (product.stock + quantity < 0) {
          throw new BadRequestError("Not enough stock available");
        }
      }

      const updatedProduct = await Product.findByIdAndUpdate(
        id,
        { $inc: { stock: quantity } },
        { new: true, runValidators: true }
      )
        .select("-__v")
        .lean();

      if (!updatedProduct) {
        throw new NotFoundError("Product not found");
      }

      let productCategories: any[] = [];

      // Add category details
      if (updatedProduct.categoryIds && updatedProduct.categoryIds.length > 0) {
        const categories = await Category.find({
          _id: { $in: updatedProduct.categoryIds },
        })
          .select("_id name nameVI slug thumbnail")
          .lean();

        productCategories = categories;
      }

      return {
        ...updatedProduct,
        categories: productCategories,
      };
    });
  }

  /**
   * Get all product IDs
   */
  public static async getAllProductIds(): Promise<string[]> {
    return await DbService.executeDbOperation(async () => {
      const products = await Product.find({}, "_id").lean();
      return products.map((product) => product._id.toString());
    });
  }

  /**
   * Update recent views count for all products
   * This counts views in the ProductView collection from the last 7 days
   * and updates the recentViews field on each product
   */
  public static async updateRecentViewsCount(): Promise<number> {
    return await DbService.executeDbOperation(async () => {
      // Get the date 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Aggregate views in the last 7 days grouped by product
      const productViewCounts = await ProductView.aggregate([
        { $match: { timestamp: { $gte: sevenDaysAgo } } },
        {
          $group: {
            _id: "$productId",
            recentViews: { $sum: 1 },
          },
        },
      ]);

      if (productViewCounts.length === 0) {
        return 0; // No recent views to update
      }

      // Define the bulk operations with the correct type
      const bulkOps: any[] = [];

      // Add individual updates for products with recent views
      productViewCounts.forEach((item) => {
        bulkOps.push({
          updateOne: {
            filter: { _id: item._id },
            update: { $set: { recentViews: item.recentViews } },
          },
        });
      });

      // Reset recentViews to 0 for products not in the recent views list
      const productIdsWithViews = productViewCounts.map((item) => item._id);
      bulkOps.push({
        updateMany: {
          filter: { _id: { $nin: productIdsWithViews } },
          update: { $set: { recentViews: 0 } },
        },
      });

      // Execute bulk update
      const result = await Product.bulkWrite(bulkOps);

      // Return the number of modified documents
      return (result.modifiedCount || 0) + (result.upsertedCount || 0);
    });
  }
}
