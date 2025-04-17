import { r2Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "../config/r2";
import fs from "fs";
import path from "path";
import { BadRequestError, InternalServerError } from "../middleware/error.middleware";
import config from "../config/env";
import { cleanupTempFiles } from "../middleware/multer.middleware";

export class MediaService {
  /**
   * Upload a file to R2 storage
   * @param filePath Path to local file
   * @param customKey Optional custom key (path) in storage
   * @param cleanupAfter Whether to delete local file after upload
   * @returns Public URL of the uploaded file
   */
  public static async uploadFile(
    filePath: string,
    customKey?: string,
    cleanupAfter: boolean = true
  ): Promise<string> {
    try {
      // Read the file
      const fileContent = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);

      // Determine content type based on file extension
      const ext = path.extname(fileName).toLowerCase();
      const contentTypeMap: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
      };

      const contentType = contentTypeMap[ext] || "application/octet-stream";

      // Create storage key (path)
      const key = customKey || `uploads/${Date.now()}-${fileName}`;

      // Upload to R2
      await r2Client.send(
        new PutObjectCommand({
          Bucket: config.R2_BUCKET_NAME,
          Key: key,
          Body: fileContent,
          ContentType: contentType,
        })
      );

      // Clean up temporary file if requested
      if (cleanupAfter) {
        cleanupTempFiles(filePath);
      }

      // Return the CDN URL
      return key;
    } catch (error: any) {
      console.error("Error uploading file:", error);
      throw new BadRequestError(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Upload multiple files to R2 storage
   * @param filePaths Array of local file paths
   * @param customKeyPrefix Optional prefix for storage keys
   * @param cleanupAfter Whether to delete local files after upload
   * @returns Array of public URLs for uploaded files
   */
  public static async uploadMultipleFiles(
    filePaths: string[],
    customKeyPrefix?: string,
    cleanupAfter: boolean = true
  ): Promise<string[]> {
    try {
      const uploadPromises = filePaths.map((filePath) => {
        const fileName = path.basename(filePath);
        const key = customKeyPrefix
          ? `${customKeyPrefix}/${Date.now()}-${fileName}`
          : `uploads/${Date.now()}-${fileName}`;

        return this.uploadFile(filePath, key, cleanupAfter);
      });

      return await Promise.all(uploadPromises);
    } catch (error: any) {
      console.error("Error uploading multiple files:", error);
      throw new BadRequestError(`Failed to upload files: ${error.message}`);
    }
  }

  /**
   * Delete a file from R2 storage
   * @param fileUrl URL of the file to delete
   * @returns True if deletion was successful
   */
  public static async deleteFile(fileUrl: string): Promise<boolean> {
    try {
      // Extract the key from the URL
      const key = fileUrl.replace(`${config.CDN_URL}/`, "");

      await r2Client.send(
        new DeleteObjectCommand({
          Bucket: config.R2_BUCKET_NAME,
          Key: key,
        })
      );

      return true;
    } catch (error: any) {
      console.error("Error deleting file:", error);
      throw new BadRequestError(`Failed to delete file: ${error.message}`);
    }
  }

  public static async listObjects(prefix: string): Promise<string[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: config.R2_BUCKET_NAME,
        Prefix: prefix,
      });

      const response = await r2Client.send(command);
      return response.Contents?.map((item) => item.Key!) || [];
    } catch (error: any) {
      console.error("Error listing objects:", error);
      throw new InternalServerError(`Failed to list objects: ${error.message}`);
    }
  }

  /**
   * Extract file URLs from R2 keys
   * @param keys Array of R2 storage keys
   * @returns Array of public URLs
   */
  public static getPublicUrls(keys: string[]): string[] {
    return keys.map((key) => `${config.CDN_URL}/${key}`);
  }
}
