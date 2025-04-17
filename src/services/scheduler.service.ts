import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { r2Client } from "../config/r2";
import config from "../config/env";
import { Product } from "../models/product.model";
import { Category } from "../models/category.model";
import { DbService } from "./db.service";
import { ProductService } from "./product.service";
import cron from "node-cron";
import path from "path";
import fs from "fs";
import {
  PRODUCT_IMAGE_PREFIX,
  PRODUCT_THUMBNAIL_PREFIX,
  CATEGORY_THUMBNAIL_PREFIX,
} from "../controllers/media.controller";

export class MediaCleanSchedulerService {
  private static isCleanupRunning = false;
  private static isTempCleanupRunning = false;
  private static TEMP_FILE_MAX_AGE = 60 * 60 * 1000; // 1 hour in milliseconds
  private static UPLOAD_DIR = path.join(process.cwd(), "uploads", "temp");

  /**
   * Initialize all scheduled tasks
   */
  public static initScheduledTasks(): void {
    // Run media cleanup at 3:00 AM every day (adjust timing as needed)
    cron.schedule("0 3 * * *", async () => {
      console.log("Running scheduled media cleanup task");
      await this.cleanupMediaFiles();
    });

    // Run temporary file cleanup every hour
    cron.schedule("0 * * * *", async () => {
      console.log("Running scheduled temporary file cleanup task");
      await this.cleanupOldTempFiles();
    });
  }

  /**
   * Run media cleanup manually (for testing or admin-triggered cleanup)
   */
  public static async runMediaCleanupManually(): Promise<{
    orphanedR2Files: number;
    danglingSavedReferences: number;
  }> {
    return await this.cleanupMediaFiles();
  }

  /**
   * Run temp file cleanup manually (for testing or admin-triggered cleanup)
   */
  public static async runTempFileCleanupManually(): Promise<{
    filesDeleted: number;
    totalSize: number;
  }> {
    return await this.cleanupOldTempFiles();
  }

  /**
   * Clean up temporary files that are older than the max age
   */
  private static async cleanupOldTempFiles(): Promise<{
    filesDeleted: number;
    totalSize: number;
  }> {
    // Prevent concurrent cleanup runs
    if (this.isTempCleanupRunning) {
      console.log("Temporary file cleanup already in progress");
      return { filesDeleted: 0, totalSize: 0 };
    }

    try {
      this.isTempCleanupRunning = true;

      // Check if temp directory exists
      if (!fs.existsSync(this.UPLOAD_DIR)) {
        console.log("Temporary directory does not exist, creating it");
        fs.mkdirSync(this.UPLOAD_DIR, { recursive: true });
        return { filesDeleted: 0, totalSize: 0 };
      }

      // Get list of files in the temp directory
      const files = fs.readdirSync(this.UPLOAD_DIR);

      // If no files exist, return early without logging cleanup started
      if (files.length === 0) {
        return { filesDeleted: 0, totalSize: 0 };
      }

      // Only log startup message if there are actually files to process
      console.log(
        `Starting temporary file cleanup process for ${files.length} items`
      );

      const now = Date.now();
      let filesDeleted = 0;
      let totalSize = 0;

      for (const file of files) {
        const filePath = path.join(this.UPLOAD_DIR, file);

        try {
          const stats = fs.statSync(filePath);

          // Check if the file is older than the max age
          if (now - stats.mtimeMs > this.TEMP_FILE_MAX_AGE) {
            totalSize += stats.size;

            // Check if it's a directory or a file
            if (stats.isDirectory()) {
              console.log(`Skipping directory: ${filePath}`);
              // If you want to delete directories too, you could use:
              // fs.rmdirSync(filePath, { recursive: true });
            } else if (stats.isFile()) {
              fs.unlinkSync(filePath);
              filesDeleted++;
            }
          }
        } catch (error) {
          console.error(`Error processing temporary item ${filePath}:`, error);
          // Continue with other files even if one fails
        }
      }

      // Only log results if files were actually deleted
      if (filesDeleted > 0) {
        console.log(
          `Cleaned up ${filesDeleted} temporary files (${Math.round(totalSize / 1024)} KB)`
        );
      }

      return { filesDeleted, totalSize };
    } catch (error) {
      console.error("Error during temporary file cleanup:", error);
      return { filesDeleted: 0, totalSize: 0 };
    } finally {
      this.isTempCleanupRunning = false;
    }
  }

  /**
   * Clean up orphaned media files and dangling references
   */
  private static async cleanupMediaFiles(): Promise<{
    orphanedR2Files: number;
    danglingSavedReferences: number;
  }> {
    // Prevent concurrent cleanup runs
    if (this.isCleanupRunning) {
      console.log("Media cleanup already in progress");
      return { orphanedR2Files: 0, danglingSavedReferences: 0 };
    }

    try {
      this.isCleanupRunning = true;
      console.log("Starting media cleanup process");

      // Step 1: Get all media keys from database
      const dbMediaKeys = await this.getMediaKeysFromDatabase();
      console.log(`Found ${dbMediaKeys.size} media keys in database`);

      // Step 2: Get all media keys from R2 storage
      const r2MediaKeys = await this.getMediaKeysFromR2();
      console.log(`Found ${r2MediaKeys.size} media keys in R2 storage`);

      // Step 3: Find orphaned R2 files (exist in R2 but not in DB)
      const orphanedR2Keys = Array.from(r2MediaKeys).filter(
        (key) => !dbMediaKeys.has(key)
      );
      console.log(
        `Found ${orphanedR2Keys.length} orphaned media files in R2 storage`
      );

      // Step 4: Delete orphaned R2 files
      await this.deleteOrphanedR2Files(orphanedR2Keys);

      // Step 5: Find dangling references in DB (exist in DB but not in R2)
      const danglingDbKeys = Array.from(dbMediaKeys).filter(
        (key) => !r2MediaKeys.has(key)
      );
      console.log(
        `Found ${danglingDbKeys.length} dangling media references in database`
      );

      // Step 6: Clean up dangling references in database
      await this.cleanupDanglingDatabaseReferences(danglingDbKeys);

      return {
        orphanedR2Files: orphanedR2Keys.length,
        danglingSavedReferences: danglingDbKeys.length,
      };
    } catch (error) {
      console.error("Error during media cleanup:", error);
      return { orphanedR2Files: 0, danglingSavedReferences: 0 };
    } finally {
      this.isCleanupRunning = false;
    }
  }

  /**
   * Get all image keys referenced in the database
   */
  private static async getMediaKeysFromDatabase(): Promise<Set<string>> {
    return await DbService.executeDbOperation(async () => {
      const mediaKeys = new Set<string>();

      // Get product image keys
      const productImages = await Product.find({
        $or: [
          { images: { $exists: true, $ne: [] } },
          {
            thumbnail: {
              $regex: `^(${PRODUCT_IMAGE_PREFIX}|${PRODUCT_THUMBNAIL_PREFIX})`,
              $options: "i",
            },
          },
        ],
      })
        .select("images thumbnail")
        .lean();

      // Process product images and thumbnails
      productImages.forEach((product) => {
        // Add thumbnail if it's a product thumbnail
        if (
          product.thumbnail &&
          (product.thumbnail.startsWith(PRODUCT_IMAGE_PREFIX) ||
            product.thumbnail.startsWith(PRODUCT_THUMBNAIL_PREFIX))
        ) {
          mediaKeys.add(product.thumbnail);
        }

        // Add all product images
        if (product.images && Array.isArray(product.images)) {
          product.images.forEach((key: string) => {
            if (key.startsWith(PRODUCT_IMAGE_PREFIX)) {
              mediaKeys.add(key);
            }
          });
        }
      });

      // Get category thumbnails
      const categoryThumbnails = await Category.find({
        thumbnail: {
          $regex: `^${CATEGORY_THUMBNAIL_PREFIX}`,
          $options: "i",
        },
      })
        .select("thumbnail")
        .lean();

      // Process category thumbnails
      categoryThumbnails.forEach((category) => {
        if (
          category.thumbnail &&
          category.thumbnail.startsWith(CATEGORY_THUMBNAIL_PREFIX)
        ) {
          mediaKeys.add(category.thumbnail);
        }
      });

      return mediaKeys;
    });
  }

  /**
   * Get all media keys stored in R2 (with our prefixes)
   */
  private static async getMediaKeysFromR2(): Promise<Set<string>> {
    try {
      const mediaKeys = new Set<string>();

      // Get all product media
      await this.getR2KeysWithPrefix(PRODUCT_IMAGE_PREFIX, mediaKeys);

      // Get all product thumbnails
      await this.getR2KeysWithPrefix(PRODUCT_THUMBNAIL_PREFIX, mediaKeys);

      // Get all category thumbnails
      await this.getR2KeysWithPrefix(CATEGORY_THUMBNAIL_PREFIX, mediaKeys);

      return mediaKeys;
    } catch (error) {
      console.error("Error listing R2 objects:", error);
      throw error;
    }
  }

  /**
   * Helper method to get R2 keys with a specific prefix
   */
  private static async getR2KeysWithPrefix(
    prefix: string,
    mediaKeys: Set<string>
  ): Promise<void> {
    let continuationToken: string | undefined;

    // R2 returns results in pages, so we need to loop until we get all keys
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: config.R2_BUCKET_NAME,
        Prefix: prefix,
        MaxKeys: 1000, // Max number of keys to return in one request
        ContinuationToken: continuationToken,
      });

      const response = await r2Client.send(listCommand);

      if (response.Contents) {
        response.Contents.forEach((item) => {
          if (item.Key) {
            mediaKeys.add(item.Key);
          }
        });
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
  }

  /**
   * Delete orphaned files from R2 storage
   */
  private static async deleteOrphanedR2Files(
    orphanedKeys: string[]
  ): Promise<void> {
    if (orphanedKeys.length === 0) return;

    try {
      // Due to S3 API limitations, we need to delete files in batches of 1000
      const batchSize = 1000;
      for (let i = 0; i < orphanedKeys.length; i += batchSize) {
        const batch = orphanedKeys.slice(i, i + batchSize);

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: config.R2_BUCKET_NAME,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        });

        await r2Client.send(deleteCommand);
        console.log(
          `Deleted batch of ${batch.length} orphaned media files from R2`
        );
      }
    } catch (error) {
      console.error("Error deleting orphaned R2 files:", error);
      throw error;
    }
  }

  /**
   * Clean up dangling media references in database
   */
  private static async cleanupDanglingDatabaseReferences(
    danglingKeys: string[]
  ): Promise<void> {
    if (danglingKeys.length === 0) return;

    return await DbService.executeDbOperation(async () => {
      // Split keys by their prefix type
      const productImageKeys = danglingKeys.filter((key) =>
        key.startsWith(PRODUCT_IMAGE_PREFIX)
      );

      const productThumbnailKeys = danglingKeys.filter((key) =>
        key.startsWith(PRODUCT_THUMBNAIL_PREFIX)
      );

      const categoryThumbnailKeys = danglingKeys.filter((key) =>
        key.startsWith(CATEGORY_THUMBNAIL_PREFIX)
      );

      // Prepare update promises
      const updatePromises = [];

      // Handle product image arrays
      if (productImageKeys.length > 0) {
        updatePromises.push(
          Product.updateMany(
            { images: { $in: productImageKeys } },
            { $pull: { images: { $in: productImageKeys } } }
          )
        );
      }

      // Handle product thumbnails
      if (productThumbnailKeys.length > 0) {
        updatePromises.push(
          Product.updateMany(
            { thumbnail: { $in: productThumbnailKeys } },
            { $set: { thumbnail: null } }
          )
        );
      }

      // Handle category thumbnails
      if (categoryThumbnailKeys.length > 0) {
        updatePromises.push(
          Category.updateMany(
            { thumbnail: { $in: categoryThumbnailKeys } },
            { $set: { thumbnail: null } }
          )
        );
      }

      // Execute all updates in parallel
      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
      }

      console.log(
        `Cleaned up ${danglingKeys.length} dangling media references in database`
      );
    });
  }
}

export class ProductViewSchedulerService {
  private static isUpdateRunning = false;

  /**
   * Initialize scheduled tasks for product view counts
   */
  public static initScheduledTasks(): void {
    // Update recent views counts every hour
    cron.schedule("0 * * * *", async () => {
      console.log("Running scheduled product recent views update");
      await this.updateRecentViews();
    });
  }

  /**
   * Run recent views update manually (for testing or admin-triggered update)
   */
  public static async runRecentViewsUpdateManually(): Promise<number> {
    return await this.updateRecentViews();
  }

  /**
   * Update recent views counts for all products
   */
  private static async updateRecentViews(): Promise<number> {
    // Prevent concurrent update runs
    if (this.isUpdateRunning) {
      console.log("Product recent views update already in progress");
      return 0;
    }

    try {
      this.isUpdateRunning = true;
      console.log("Starting product recent views update process");

      // Update recent views count using product service
      const updatedCount = await ProductService.updateRecentViewsCount();
      console.log(`Updated recent views count for ${updatedCount} products`);

      return updatedCount;
    } catch (error) {
      console.error("Error during product recent views update:", error);
      return 0;
    } finally {
      this.isUpdateRunning = false;
    }
  }
}
