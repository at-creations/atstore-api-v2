import { Category, ICategoryDocument } from "../models/category.model";
import { generateSlug } from "../utils/text.utils";
import { BadRequestError, NotFoundError } from "../middleware/error.middleware";
import { DbService } from "./db.service";
import { Product } from "../models/product.model";

export class CategoryService {
  /**
   * Create a new category
   * @param categoryData Category data to create
   * @returns Created category
   */
  public static async createCategory(
    categoryData: any
  ): Promise<ICategoryDocument> {
    return await DbService.executeDbOperation(async () => {
      // Generate initial slug if not provided
      if (!categoryData.slug && categoryData.name) {
        categoryData.slug = generateSlug(categoryData.name);
      }

      const newCategory = new Category(categoryData);
      // Pre-save hook will handle unique slug creation
      await newCategory.save();
      return newCategory;
    });
  }

  /**
   * Find a category by ID or slug
   * @param idOrSlug Category ID or slug
   * @returns Category document or null if not found
   */
  public static async findCategoryByIdOrSlug(idOrSlug: string): Promise<any> {
    return await DbService.executeDbOperation(async () => {
      // Build query based on input format
      let query = {};

      if (DbService.isValidObjectId(idOrSlug)) {
        // If valid ObjectId, search by ID only to avoid MongoDB errors
        query = { _id: idOrSlug };
      } else {
        // Otherwise search by slug
        query = { slug: idOrSlug };
      }

      const category = await Category.findOne(query).select("-__v").lean();

      if (!category) {
        throw new NotFoundError("Category not found");
      }

      return category;
    });
  }

  /**
   * Search for categories with various filters and pagination
   * @param params Search parameters
   * @returns Categories and total count
   */
  public static async searchCategories(params: {
    search?: string;
    sort?: string;
    order?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ categories: any[]; totalCount: number }> {
    const {
      search = "",
      sort = "name",
      order = "asc",
      page = 1,
      pageSize = 10,
    } = params;

    // Validate sort field to prevent injection
    const allowedSortFields = ["name", "nameVI", "createdAt", "updatedAt"];
    if (!allowedSortFields.includes(sort)) {
      throw new BadRequestError("Invalid sort field");
    }

    const orderValue = order === "desc" ? -1 : 1;
    const skip = (page - 1) * pageSize;

    // Build filter for text search
    const filter: Record<string, any> = {};

    if (search) {
      // Escape special regex characters to prevent injection
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Always use case-insensitive partial matching for better user experience
      filter.$or = [
        { name: { $regex: escapedSearch, $options: "i" } },
        { nameVI: { $regex: escapedSearch, $options: "i" } },
        { normalizedNameVI: { $regex: escapedSearch, $options: "i" } },
        { description: { $regex: escapedSearch, $options: "i" } },
        { descriptionVI: { $regex: escapedSearch, $options: "i" } },
        { normalizedDescriptionVI: { $regex: escapedSearch, $options: "i" } },
        { slug: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    // Create sort object
    const sortOptions: Record<string, 1 | -1> = {};
    sortOptions[sort] = orderValue;

    // Execute search with pagination
    return await DbService.executeDbOperation(async () => {
      const [categories, totalCount] = await Promise.all([
        Category.find(filter)
          .select("-__v")
          .sort(sortOptions)
          .skip(skip)
          .limit(pageSize)
          .lean(),
        Category.countDocuments(filter),
      ]);

      return { categories, totalCount };
    });
  }

  /**
   * Update a category by ID
   * @param id Category ID
   * @param updateData Data to update
   * @returns Updated category
   */
  public static async updateCategory(
    id: string,
    updateData: any
  ): Promise<any> {
    if (!DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid category ID");
    }

    return await DbService.executeDbOperation(async () => {
      // Prevent slug from being directly updated as it's handled by pre-save hook
      if (updateData.slug) {
        delete updateData.slug;
      }

      const updatedCategory = await Category.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      })
        .select("-__v")
        .lean();

      if (!updatedCategory) {
        throw new NotFoundError("Category not found");
      }

      return updatedCategory;
    });
  }

  /**
   * Delete a category by ID
   * @param id Category ID
   * @returns Deleted category
   */
  public static async deleteCategory(id: string): Promise<any> {
    if (!DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid category ID");
    }

    return await DbService.executeDbOperation(async () => {
      // First check if the category exists
      const category = await Category.findById(id);
      if (!category) {
        throw new NotFoundError("Category not found");
      }

      // Delete the category immediately
      const deletedCategory = await Category.findByIdAndDelete(id)
        .select("-__v")
        .lean();

      // Schedule product cleanup to happen asynchronously
      // We don't await this operation
      this.cleanupCategoryReferences(id)
        .then((updatedCount) => {
          console.log(
            `Category ${id} deleted. Cleaned up ${updatedCount} products.`
          );
        })
        .catch((error) => {
          console.error(`Error cleaning up category ${id} references:`, error);
        });

      // Return the deleted category right away
      return deletedCategory;
    });
  }

  /**
   * Asynchronously remove category references from products
   * @param categoryId The ID of the deleted category
   * @returns Number of updated products
   */
  private static async cleanupCategoryReferences(
    categoryId: string
  ): Promise<number> {
    try {
      const result = await Product.updateMany(
        { categoryIds: categoryId },
        { $pull: { categoryIds: categoryId } }
      );

      return result.modifiedCount;
    } catch (error) {
      console.error(
        `Failed to clean up references to category ${categoryId}:`,
        error
      );
      // We don't re-throw the error since this is an async background operation
      return 0;
    }
  }

  /**
   * Bulk create multiple categories
   * @param categoriesData Array of category data
   * @returns Created categories
   */
  public static async bulkCreateCategories(
    categoriesData: any[]
  ): Promise<ICategoryDocument[]> {
    // Validate input
    if (!Array.isArray(categoriesData) || categoriesData.length === 0) {
      throw new BadRequestError("Categories data must be a non-empty array");
    }

    // Validate each category has required fields
    for (const categoryData of categoriesData) {
      if (!categoryData.name) {
        throw new BadRequestError("Each category must have a name");
      }
    }

    return await DbService.executeDbOperation(async () => {
      const createdCategories: ICategoryDocument[] = [];

      // Process each category one by one to ensure hooks are executed
      // This is necessary for slug generation and normalization
      for (const categoryData of categoriesData) {
        // Generate initial slug if not provided
        if (!categoryData.slug && categoryData.name) {
          categoryData.slug = generateSlug(categoryData.name);
        }

        const category = new Category(categoryData);
        await category.save();
        createdCategories.push(category);
      }

      return createdCategories;
    });
  }

  /**
   * Convert category slugs to category IDs
   * @param slugsOrIds Array of category slugs or IDs or mixed
   * @returns Array of category IDs
   */
  public static async convertToIds(slugsOrIds: string[]): Promise<string[]> {
    if (!Array.isArray(slugsOrIds) || slugsOrIds.length === 0) {
      return [];
    }

    return await DbService.executeDbOperation(async () => {
      const ids: string[] = [];
      const slugsToLookup: string[] = [];

      // Separate IDs from slugs
      for (const item of slugsOrIds) {
        if (DbService.isValidObjectId(item)) {
          ids.push(item);
        } else {
          slugsToLookup.push(item);
        }
      }

      // If we have slugs to convert, look them up
      if (slugsToLookup.length > 0) {
        const categories = await Category.find({ slug: { $in: slugsToLookup } })
          .select("_id slug")
          .lean();

        // Create a map of slug to ID for fast lookup
        const slugToIdMap = new Map<string, string>();
        categories.forEach((cat) => {
          slugToIdMap.set(cat.slug, cat._id.toString());
        });

        // Check if all slugs were found
        const notFoundSlugs = slugsToLookup.filter(
          (slug) => !slugToIdMap.has(slug)
        );
        if (notFoundSlugs.length > 0) {
          throw new NotFoundError(
            `Categories not found: ${notFoundSlugs.join(", ")}`
          );
        }

        // Add the IDs from the slugs
        slugsToLookup.forEach((slug) => {
          ids.push(slugToIdMap.get(slug)!);
        });
      }

      return ids;
    });
  }
}
