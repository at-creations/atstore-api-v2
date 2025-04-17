import { Request, Response } from "express";
import crypto from "crypto";
import { asyncHandler } from "../utils/async-handler.util";
import { BadRequestError, NotFoundError } from "../middleware/error.middleware";
import { MediaService } from "../services/media.service";
import { ProductService } from "../services/product.service";
import { CategoryService } from "../services/category.service";
import { DbService } from "../services/db.service";
import { successResponse } from "../models/response.model";
import {
  uploadMultiple,
  getFilePaths,
  uploadSingle,
} from "../middleware/multer.middleware";
import path from "path";
import { MediaCleanSchedulerService } from "../services/scheduler.service";

export const PRODUCT_IMAGE_PREFIX = "img/product/";
export const PRODUCT_THUMBNAIL_PREFIX = "img/product/thumbnail/";
export const CATEGORY_THUMBNAIL_PREFIX = "img/category/thumbnail/";
export const PAGE_MEDIA_PREFIX = "data/";

const PRODUCT_IMAGE_KEY_PREFIX = (id: string, fileName: string) =>
  `${PRODUCT_IMAGE_PREFIX}${id}/${fileName}`;

const PRODUCT_THUMBNAIL_KEY_PREFIX = (id: string, fileName: string) =>
  `${PRODUCT_THUMBNAIL_PREFIX}${id}/${fileName}`;

const CATEGORY_THUMBNAIL_KEY_PREFIX = (id: string, fileName: string) =>
  `${CATEGORY_THUMBNAIL_PREFIX}${id}/${fileName}`;

const PAGE_MEDIA_KEY = (fileName: string) => `${PAGE_MEDIA_PREFIX}${fileName}`;

const generateFileName = (id: string, extension: string) => {
  const timestamp = Date.now();
  const randomHexStr = crypto.randomBytes(4).toString("hex");
  return `${id}_${timestamp}_${randomHexStr}.${extension}`;
};

/**
 * Upload multiple images for a product and add them to the product's images array
 * Automatically detects a file named "thumb.*" to use as the product thumbnail
 */
export const uploadProductMedia = [
  // First middleware: Handle file uploads with multer
  uploadMultiple("images"),

  // Second middleware: Process files and update product
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate product ID
    if (!id || !DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid product ID");
    }

    // Verify files were uploaded
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      throw new BadRequestError("No images uploaded");
    }

    // Get product to ensure it exists
    const product = await ProductService.getProductById(id);

    if (!product) {
      throw new NotFoundError("Product not found");
    }

    // Get paths to the uploaded files
    const filePaths = getFilePaths(req.files);

    // Find thumbnail image (file with name starting with "thumb.")
    const files = Array.isArray(req.files) ? req.files : [];
    const thumbnailFile = files.find((file) =>
      path.basename(file.originalname).toLowerCase().startsWith("thumb.")
    );

    let thumbnailKey: string | null = null;

    // Handle thumbnail if found
    if (thumbnailFile) {
      const thumbnailPath = thumbnailFile.path;
      const fileExt = path.extname(thumbnailPath).substring(1); // Remove the dot
      const fileName = generateFileName(id, fileExt);
      const key = PRODUCT_THUMBNAIL_KEY_PREFIX(id, fileName);

      // Delete previous thumbnail if exists
      if (
        product.thumbnail &&
        product.thumbnail.startsWith(PRODUCT_THUMBNAIL_PREFIX)
      ) {
        try {
          await MediaService.deleteFile(product.thumbnail);
        } catch (error) {
          console.error(
            `Failed to delete previous thumbnail: ${product.thumbnail}`,
            error
          );
          // Continue with upload even if deletion fails
        }
      }

      // Upload thumbnail to R2 storage
      thumbnailKey = await MediaService.uploadFile(thumbnailPath, key);
    }

    // Create upload promises for all remaining images
    const imageUploadPromises = filePaths
      .filter((filePath) => {
        // Skip the thumbnail file if it was processed already
        if (!thumbnailFile) return true;
        return filePath !== thumbnailFile.path;
      })
      .map((filePath) => {
        const fileExt = path.extname(filePath).substring(1); // Remove the dot
        const fileName = generateFileName(id, fileExt);
        const key = PRODUCT_IMAGE_KEY_PREFIX(id, fileName);

        return MediaService.uploadFile(filePath, key);
      });

    // Upload all remaining files to R2 storage
    const imageKeys = await Promise.all(imageUploadPromises);

    // Build update document based on what we're updating
    const updateDoc: any = {};

    // Add images to update
    if (imageKeys.length > 0) {
      updateDoc.$push = { images: { $each: imageKeys } };
    }

    // Add thumbnail to update if we have one
    if (thumbnailKey) {
      updateDoc.thumbnail = thumbnailKey;
    }

    // Update product
    const updatedProduct = await ProductService.updateProduct(id, updateDoc);

    // Invalidate product cache after updating images
    const {
      cacheRedisUtils,
      REDIS_CACHE_KEYS,
    } = require("../utils/redis.utils");
    await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.PRD.DET}${id}`);
    // Also invalidate any list caches that may include this product
    await cacheRedisUtils.delByPattern(`${REDIS_CACHE_KEYS.PRD.LST}*`);

    // Build response message
    let successMessage = `Successfully uploaded ${imageKeys.length} images`;
    if (thumbnailKey) {
      successMessage += ` and set thumbnail`;
    }

    // Return success response with updated product
    return res.status(200).json(
      successResponse(successMessage, {
        imageKeys,
        thumbnailKey,
        product: updatedProduct,
      })
    );
  }),
];

/**
 * Delete product images
 * Supports deleting specific images by providing fileKeys array
 * or deleting all images with fileKeys: "\_\_all\_\_"
 */
export const deleteProductMedia = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { fileKeys } = req.body;

    // Validate product ID
    if (!id || !DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid product ID");
    }

    // Get product to ensure it exists and get current images
    const product = await ProductService.getProductById(id);

    if (!product) {
      throw new NotFoundError("Product not found");
    }

    // Handle deleting all images
    if (fileKeys === "__all__") {
      // Delete all images from storage
      if (product.images.length > 0) {
        const deletePromises: Promise<boolean>[] = product.images.map(
          (key: string) =>
            MediaService.deleteFile(key).catch((err: Error) => {
              console.error(`Failed to delete file ${key}:`, err);
              return false; // Continue with other deletions even if one fails
            })
        );

        await Promise.all(deletePromises);
      }

      // Update product to remove all image references
      await ProductService.updateProduct(id, { images: [] });

      return res.status(200).json(
        successResponse(
          `Successfully deleted all ${product.images.length} images from product`,
          {
            deletedCount: product.images.length,
          }
        )
      );
    }

    // Validate fileKeys for specific deletion
    if (!Array.isArray(fileKeys) || fileKeys.length === 0) {
      throw new BadRequestError(
        "fileKeys must be an array of file keys or '__all__'"
      );
    }
    let warning = undefined;

    // Verify all keys exist in the product
    const nonExistentKeys = fileKeys.filter(
      (key) => !product.images.includes(key)
    );
    if (nonExistentKeys.length > 0) {
      warning = `Some file keys don't exist in the product: ${nonExistentKeys.join(", ")}`;
    }

    // Exclude non-existent keys from fileKeys
    const validFileKeys = fileKeys.filter(
      (key) => !nonExistentKeys.includes(key)
    );

    // Delete specific images from storage
    const deletePromises = validFileKeys.map((key) =>
      MediaService.deleteFile(key).catch((err) => {
        console.error(`Failed to delete file ${key}:`, err);
        return false; // Continue with other deletions even if one fails
      })
    );

    await Promise.all(deletePromises);

    // Update product to remove the deleted image references
    await ProductService.updateProduct(id, {
      $pull: { images: { $in: validFileKeys } },
    });

    // Invalidate product cache after deleting images
    const {
      cacheRedisUtils,
      REDIS_CACHE_KEYS,
    } = require("../utils/redis.utils");
    await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.PRD.DET}${id}`);
    // Also invalidate list caches that may include this product
    await cacheRedisUtils.delByPattern(`${REDIS_CACHE_KEYS.PRD.LST}*`);

    return res.status(200).json(
      successResponse(
        `Successfully deleted ${fileKeys.length} images from product`,
        {
          warning,
          deletedKeys: validFileKeys,
        }
      )
    );
  }
);

/**
 * Upload a thumbnail image for a product
 */
export const uploadProductThumbnail = [
  // First middleware: Handle single image upload with multer
  uploadSingle("thumbnail"),

  // Second middleware: Process the file and update product
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate product ID
    if (!id || !DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid product ID");
    }

    // Verify file was uploaded
    if (!req.file) {
      throw new BadRequestError("No thumbnail image uploaded");
    }

    // Get product to ensure it exists
    const product = await ProductService.getProductById(id);

    if (!product) {
      throw new NotFoundError("Product not found");
    }

    // Get the uploaded file path
    const filePath = req.file.path;
    const fileExt = path.extname(filePath).substring(1); // Remove the dot
    const fileName = generateFileName(id, fileExt);
    const key = PRODUCT_THUMBNAIL_KEY_PREFIX(id, fileName);

    // Delete previous thumbnail if exists
    if (
      product.thumbnail &&
      product.thumbnail.startsWith(PRODUCT_THUMBNAIL_PREFIX)
    ) {
      try {
        await MediaService.deleteFile(product.thumbnail);
      } catch (error) {
        console.error(
          `Failed to delete previous thumbnail: ${product.thumbnail}`,
          error
        );
        // Continue with upload even if deletion fails
      }
    }

    // Upload thumbnail to R2 storage
    const thumbnailKey = await MediaService.uploadFile(filePath, key);

    // Update product with new thumbnail URL
    const updatedProduct = await ProductService.updateProduct(id, {
      thumbnail: thumbnailKey,
    });

    // Invalidate product cache after updating thumbnail
    const {
      cacheRedisUtils,
      REDIS_CACHE_KEYS,
    } = require("../utils/redis.utils");
    await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.PRD.DET}${id}`);
    // Also invalidate list caches that may include this product with its thumbnail
    await cacheRedisUtils.delByPattern(`${REDIS_CACHE_KEYS.PRD.LST}*`);

    // Return success response with updated product
    return res.status(200).json(
      successResponse("Successfully uploaded product thumbnail", {
        thumbnailKey,
        product: updatedProduct,
      })
    );
  }),
];

/**
 * Delete a product's thumbnail image
 */
export const deleteProductThumbnail = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate product ID
    if (!id || !DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid product ID");
    }

    // Get product to ensure it exists and has a thumbnail
    const product = await ProductService.getProductById(id);

    if (!product) {
      throw new NotFoundError("Product not found");
    }

    // Check if product has a thumbnail
    if (!product.thumbnail) {
      return res.status(200).json(
        successResponse("Product does not have a thumbnail to delete", {
          thumbnailDeleted: false,
        })
      );
    }

    // Only delete if the thumbnail starts with our thumbnail prefix
    // This ensures we don't accidentally delete images from other domains or external URLs
    if (product.thumbnail.startsWith(PRODUCT_THUMBNAIL_PREFIX)) {
      try {
        // Delete thumbnail from storage
        await MediaService.deleteFile(product.thumbnail);

        // Update product to remove thumbnail reference
        await ProductService.updateProduct(id, {
          $unset: { thumbnail: 1 },
        });

        // Invalidate product cache after removing thumbnail
        const {
          cacheRedisUtils,
          REDIS_CACHE_KEYS,
        } = require("../utils/redis.utils");
        await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.PRD.DET}${id}`);
        // Also invalidate list caches that may include this product with its thumbnail
        await cacheRedisUtils.delByPattern(`${REDIS_CACHE_KEYS.PRD.LST}*`);

        return res.status(200).json(
          successResponse("Successfully deleted product thumbnail", {
            thumbnailDeleted: true,
            deletedKey: product.thumbnail,
          })
        );
      } catch (error) {
        console.error(
          `Failed to delete thumbnail: ${product.thumbnail}`,
          error
        );
        throw new BadRequestError("Failed to delete thumbnail from storage");
      }
    } else {
      // If not a thumbnail we manage in our bucket, just remove the reference
      // This handles external URLs or thumbnails stored elsewhere
      await ProductService.updateProduct(id, {
        $unset: { thumbnail: 1 },
      });

      // Invalidate product cache after removing thumbnail reference
      const {
        cacheRedisUtils,
        REDIS_CACHE_KEYS,
      } = require("../utils/redis.utils");
      await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.PRD.DET}${id}`);
      // Also invalidate list caches that may include this product with its thumbnail
      await cacheRedisUtils.delByPattern(`${REDIS_CACHE_KEYS.PRD.LST}*`);

      return res.status(200).json(
        successResponse("Removed thumbnail reference from product", {
          thumbnailDeleted: false,
          referenceRemoved: true,
          externalUrl: product.thumbnail,
        })
      );
    }
  }
);

/**
 * Upload a thumbnail image for a category
 */
export const uploadCategoryThumbnail = [
  // First middleware: Handle single image upload with multer
  uploadSingle("thumbnail"),

  // Second middleware: Process the file and update category
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate category ID
    if (!id || !DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid category ID");
    }

    // Verify file was uploaded
    if (!req.file) {
      throw new BadRequestError("No thumbnail image uploaded");
    }

    // Get category to ensure it exists
    const category = await CategoryService.findCategoryByIdOrSlug(id);

    if (!category) {
      throw new NotFoundError("Category not found");
    }

    // Get the uploaded file path
    const filePath = req.file.path;
    const fileExt = path.extname(filePath).substring(1); // Remove the dot
    const fileName = generateFileName(id, fileExt);
    const key = CATEGORY_THUMBNAIL_KEY_PREFIX(id, fileName);

    // Delete previous thumbnail if exists
    if (
      category.thumbnail &&
      category.thumbnail.startsWith(CATEGORY_THUMBNAIL_PREFIX)
    ) {
      try {
        await MediaService.deleteFile(category.thumbnail);
      } catch (error) {
        console.error(
          `Failed to delete previous thumbnail: ${category.thumbnail}`,
          error
        );
        // Continue with upload even if deletion fails
      }
    }

    // Upload thumbnail to R2 storage
    const thumbnailKey = await MediaService.uploadFile(filePath, key);

    // Update category with new thumbnail URL
    const updatedCategory = await CategoryService.updateCategory(id, {
      thumbnail: thumbnailKey,
    });

    // Invalidate category cache
    const {
      cacheRedisUtils,
      REDIS_CACHE_KEYS,
    } = require("../utils/redis.utils");
    await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.CAT.DET}${id}`);
    await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.CAT.DET}${category.slug}`);

    // Return success response with updated category
    return res.status(200).json(
      successResponse("Successfully uploaded category thumbnail", {
        thumbnailKey,
        category: updatedCategory,
      })
    );
  }),
];

/**
 * Delete a category's thumbnail image
 */
export const deleteCategoryThumbnail = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    // Validate category ID
    if (!id || !DbService.isValidObjectId(id)) {
      throw new BadRequestError("Invalid category ID");
    }

    // Get category to ensure it exists and has a thumbnail
    const category = await CategoryService.findCategoryByIdOrSlug(id);

    if (!category) {
      throw new NotFoundError("Category not found");
    }

    // Check if category has a thumbnail
    if (!category.thumbnail) {
      return res.status(200).json(
        successResponse("Category does not have a thumbnail to delete", {
          thumbnailDeleted: false,
        })
      );
    }

    // Only delete if the thumbnail starts with our thumbnail prefix
    // This ensures we don't accidentally delete images from other domains or external URLs
    if (category.thumbnail.startsWith(CATEGORY_THUMBNAIL_PREFIX)) {
      try {
        // Delete thumbnail from storage
        await MediaService.deleteFile(category.thumbnail);

        // Update category to remove thumbnail reference
        await CategoryService.updateCategory(id, {
          $unset: { thumbnail: 1 },
        });

        // Invalidate category cache
        const {
          cacheRedisUtils,
          REDIS_CACHE_KEYS,
        } = require("../utils/redis.utils");
        await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.CAT.DET}${id}`);
        await cacheRedisUtils.del(
          `${REDIS_CACHE_KEYS.CAT.DET}${category.slug}`
        );

        return res.status(200).json(
          successResponse("Successfully deleted category thumbnail", {
            thumbnailDeleted: true,
            deletedKey: category.thumbnail,
          })
        );
      } catch (error) {
        console.error(
          `Failed to delete thumbnail: ${category.thumbnail}`,
          error
        );
        throw new BadRequestError("Failed to delete thumbnail from storage");
      }
    } else {
      // If not a thumbnail we manage in our bucket, just remove the reference
      // This handles external URLs or thumbnails stored elsewhere
      await CategoryService.updateCategory(id, {
        $unset: { thumbnail: 1 },
      });

      // Invalidate category cache
      const {
        cacheRedisUtils,
        REDIS_CACHE_KEYS,
      } = require("../utils/redis.utils");
      await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.CAT.DET}${id}`);
      await cacheRedisUtils.del(`${REDIS_CACHE_KEYS.CAT.DET}${category.slug}`);

      return res.status(200).json(
        successResponse("Removed thumbnail reference from category", {
          thumbnailDeleted: false,
          referenceRemoved: true,
          externalUrl: category.thumbnail,
        })
      );
    }
  }
);

/**
 * Upload images for a page
 * Keeping original file names
 */
export const uploadPageMedia = [
  // First middleware: Handle file uploads with multer
  uploadMultiple("images"),

  // Second middleware: Process files and upload them with original filenames
  asyncHandler(async (req: Request, res: Response) => {
    // Verify files were uploaded
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      throw new BadRequestError("No images uploaded");
    }

    // Get paths to the uploaded files
    const filePaths = getFilePaths(req.files);
    const files = Array.isArray(req.files) ? req.files : [];

    // Create upload promises for all files, keeping original filenames
    const imageUploadPromises = files.map((file) => {
      const originalName = file.originalname;
      const key = PAGE_MEDIA_KEY(originalName);
      return MediaService.uploadFile(file.path, key);
    });

    // Upload all files to R2 storage
    const imageKeys = await Promise.all(imageUploadPromises);

    // Return success response
    return res.status(200).json(
      successResponse(
        `Successfully uploaded ${imageKeys.length} page media files`,
        {
          imageKeys,
        }
      )
    );
  }),
];

/**
 * List all page media keys
 */
export const listPageMedia = asyncHandler(
  async (req: Request, res: Response) => {
    // List all page media keys
    const pageMediaKeys = await MediaService.listObjects(PAGE_MEDIA_PREFIX);

    return res.status(200).json(
      successResponse("Successfully listed page media files", {
        pageMediaKeys,
      })
    );
  }
);

/**
 * Delete page media files by keys
 */
export const deletePageMedia = asyncHandler(
  async (req: Request, res: Response) => {
    const { fileKeys } = req.body;

    // Validate fileKeys
    if (!Array.isArray(fileKeys) || fileKeys.length === 0) {
      throw new BadRequestError(
        "fileKeys must be a non-empty array of file keys"
      );
    }

    // Validate that all keys are page media keys
    const invalidKeys = fileKeys.filter(
      (key) => !key.startsWith(PAGE_MEDIA_PREFIX)
    );
    if (invalidKeys.length > 0) {
      throw new BadRequestError(
        `Invalid page media keys: ${invalidKeys.join(", ")}`
      );
    }

    // Delete files from storage
    const deletePromises = fileKeys.map((key) =>
      MediaService.deleteFile(key).catch((err) => {
        console.error(`Failed to delete file ${key}:`, err);
        return false;
      })
    );

    const results = await Promise.all(deletePromises);
    const successCount = results.filter((result) => result === true).length;

    return res.status(200).json(
      successResponse(
        `Successfully deleted ${successCount} of ${fileKeys.length} page media files`,
        {
          deletedCount: successCount,
          requestedCount: fileKeys.length,
        }
      )
    );
  }
);

/**
 * Manually run media cleanup to remove orphaned files and dangling references
 * Admin only endpoint
 */
export const cleanupMedia = asyncHandler(
  async (req: Request, res: Response) => {
    // Run cleanup process
    const result = await MediaCleanSchedulerService.runMediaCleanupManually();

    return res.status(200).json(
      successResponse("Media cleanup completed successfully", {
        orphanedFilesRemoved: result.orphanedR2Files,
        danglingReferencesFixed: result.danglingSavedReferences,
      })
    );
  }
);

/**
 * Manually run temporary file cleanup to remove files older than 1 hour
 * Admin only endpoint
 */
export const cleanupTempFiles = asyncHandler(
  async (req: Request, res: Response) => {
    // Run cleanup process
    const result =
      await MediaCleanSchedulerService.runTempFileCleanupManually();

    return res.status(200).json(
      successResponse("Temporary file cleanup completed successfully", {
        filesDeleted: result.filesDeleted,
        sizeFreed: `${Math.round(result.totalSize / 1024)} KB`,
      })
    );
  }
);
