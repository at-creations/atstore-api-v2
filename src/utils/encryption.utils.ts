import crypto from "crypto";
import config from "../config/env";

/**
 * Utility class for encrypting and decrypting sensitive data
 */
export class EncryptionUtils {
  private static readonly ALGORITHM = "aes-256-gcm";
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly IV_LENGTH = 16; // 128 bits
  private static readonly AUTH_TAG_LENGTH = 16; // 128 bits

  /**
   * Derives an encryption key from the application secret
   * @returns Buffer containing the encryption key
   */
  private static getEncryptionKey(): Buffer {
    // Use JWT_SECRET as the base for deriving the encryption key
    // In production, a separate dedicated encryption key should be used
    const baseSecret = config.JWT_SECRET;

    // Use PBKDF2 to derive a strong key from the secret
    return crypto.pbkdf2Sync(
      baseSecret,
      config.APP_API_SECRET,
      10000, // Number of iterations
      this.KEY_LENGTH,
      "sha256"
    );
  }

  /**
   * Encrypts a string
   * @param text The text to encrypt
   * @returns Encrypted data with IV and auth tag as a hex string
   */
  public static encrypt(text: string): string {
    // Generate a random initialization vector
    const iv = crypto.randomBytes(this.IV_LENGTH);

    // Create cipher using our key and IV
    const key = this.getEncryptionKey();
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    // Encrypt the data
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Get the authentication tag
    const authTag = cipher.getAuthTag();

    // Combine IV, encrypted data, and auth tag into a single string
    // Format: iv:encryptedData:authTag
    return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
  }

  /**
   * Decrypts an encrypted string
   * @param encryptedText The encrypted text (in the format iv:encryptedData:authTag)
   * @returns The decrypted string
   */
  public static decrypt(encryptedText: string): string {
    try {
      // Split the encrypted text to extract the components
      const parts = encryptedText.split(":");
      if (parts.length !== 3) {
        throw new Error("Invalid encrypted format");
      }

      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];
      const authTag = Buffer.from(parts[2], "hex");

      // Create decipher
      const key = this.getEncryptionKey();
      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);

      // Set the auth tag
      decipher.setAuthTag(authTag);

      // Decrypt the data
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      // If decryption fails, return an empty string or handle the error as needed
      console.error("Decryption failed:", error);
      return "";
    }
  }
}
