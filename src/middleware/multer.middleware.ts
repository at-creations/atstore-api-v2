import multer from "multer";
import { Request } from "express";
import path from "path";
import fs from "fs";
import { BadRequestError } from "./error.middleware";
import crypto from "crypto";

export const MAX_IMAGES_PER_UPLOAD = 6; // Max images per upload
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // Max image size (5MB)
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
]; // Allowed image MIME types

// Create upload directory if it doesn't exist
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "temp");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with original extension
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    const fileExt = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${fileExt}`);
  },
});

// File filter to validate image types
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Accept only image files
  const allowedMimes = IMAGE_MIME_TYPES;

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new BadRequestError(
        `Invalid file type. Only ${allowedMimes.join(", ")} are allowed.`
      )
    );
  }
};

// Create multer instance with configuration
export const imageUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: MAX_IMAGES_PER_UPLOAD,
  },
});

// Middleware for single image upload
export const uploadSingle = (fieldName: string = "image") => {
  return imageUpload.single(fieldName);
};

// Middleware for multiple image uploads (with limit)
export const uploadMultiple = (
  fieldName: string = "images",
  maxCount: number = MAX_IMAGES_PER_UPLOAD
) => {
  return imageUpload.array(fieldName, maxCount);
};

// Middleware for multiple fields with different file counts
export const uploadFields = (fields: { name: string; maxCount: number }[]) => {
  return imageUpload.fields(fields);
};

/**
 * Cleanup temporary files after processing
 * @param filePaths Array of file paths, single file path, or "__all__" to delete all files in the temp directory
 */
export const cleanupTempFiles = (filePaths: string | string[] | "__all__"): void => {
  if (filePaths === "__all__") {
    try {
      const files = fs.readdirSync(UPLOAD_DIR);
      files.forEach((file) => {
        const filePath = path.join(UPLOAD_DIR, file);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (error) {
          console.error(`Failed to delete temporary file ${filePath}:`, error);
        }
      });
    } catch (error) {
      console.error(`Failed to delete all temporary files in ${UPLOAD_DIR}:`, error);
    }
    return;
  }

  // Convert single path to array
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];

  paths.forEach((filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Failed to delete temporary file ${filePath}:`, error);
    }
  });
};

/**
 * Helper to get full file paths for uploaded files
 * @param files File or files uploaded by multer
 * @returns Array of full file paths
 */
export const getFilePaths = (
  files:
    | Express.Multer.File
    | Express.Multer.File[]
    | { [fieldname: string]: Express.Multer.File[] }
): string[] => {
  if (!files) return [];

  // Single file
  if ("path" in files) {
    return typeof files.path === "string" ? [files.path] : [];
  }

  // Array of files
  if (Array.isArray(files)) {
    return files.map((file) => file.path);
  }

  // Multiple fields with files
  return Object.values(files)
    .flat()
    .map((file) => file.path);
};
