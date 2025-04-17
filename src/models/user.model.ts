import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { EncryptionUtils } from "../utils/encryption.utils";

// Constants
export const PASSWORD_VALIDATION_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
export const PASSWORD_ERROR_MESSAGE =
  "Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character";

export const TRUNC_KEY_LENGTH = 10; // Length of the truncated key for display purposes

export type UserRole = "user" | "admin" | "manager" | "staff";
export const VALID_ROLES: string[] = ["user", "admin", "manager", "staff"];

export interface UserResponse {
  id?: string | mongoose.Types.ObjectId;
  _id?: string | mongoose.Types.ObjectId;
  email: string;
  username: string;
  name: string;
  role: UserRole;
  isEnabled: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKey {
  key: string;
  truncatedKey: string; // Store the first 5 digits of the original key for easier searching
  name: string;
  createdAt: Date;
  lastUsed?: Date;
}

// Interface to track the original API key for new keys
// This won't be persisted to the database
export interface ApiKeyWithPlaintext extends ApiKey {
  plaintextKey?: string;
}

export interface IUser {
  email: string;
  username: string;
  password: string;
  name: string;
  role: UserRole;
  isEnabled: boolean;
  isVerified: boolean;
  apiKeys?: ApiKey[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {
  _id: mongoose.Types.ObjectId; // Explicitly define the _id type
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateApiKey(name: string): ApiKey;
}

const apiKeySchema = new Schema<ApiKey>(
  {
    key: {
      type: String,
      required: true,
    },
    truncatedKey: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastUsed: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        "Invalid email format",
      ],
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      match: [
        /^[a-zA-Z0-9_\.]+$/,
        "Username can only contain letters, numbers, underscores and periods",
      ],
    },
    password: {
      type: String,
      required: true,
      validate: {
        validator: function (password: string) {
          return PASSWORD_VALIDATION_REGEX.test(password);
        },
        message: PASSWORD_ERROR_MESSAGE,
      },
    },
    name: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: VALID_ROLES,
      default: "user",
    },
    isEnabled: {
      type: Boolean,
      default: true,
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
      required: true,
    },
    apiKeys: {
      type: [apiKeySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    // Validate password format before hashing
    if (!PASSWORD_VALIDATION_REGEX.test(this.password)) {
      throw new Error(PASSWORD_ERROR_MESSAGE);
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to generate new API key
userSchema.methods.generateApiKey = function (
  name: string
): ApiKeyWithPlaintext {
  // Generate a random API key
  const plaintextKey = `at_${crypto.randomBytes(32).toString("hex")}`;

  // Encrypt the API key before storing
  const encryptedKey = EncryptionUtils.encrypt(plaintextKey);

  const apiKey: ApiKeyWithPlaintext = {
    key: encryptedKey, // Store the encrypted version in the database
    truncatedKey: plaintextKey.slice(0, TRUNC_KEY_LENGTH), // Store some first digits of the original key for easier searching
    name,
    createdAt: new Date(),
    lastUsed: undefined,
    plaintextKey: plaintextKey, // Keep the plaintext version temporarily to return to the user
  };

  if (!this.apiKeys) {
    this.apiKeys = [];
  }

  this.apiKeys.push({
    key: apiKey.key,
    truncatedKey: apiKey.truncatedKey,
    name: apiKey.name,
    createdAt: apiKey.createdAt,
    lastUsed: apiKey.lastUsed,
  });

  apiKey.key = apiKey.plaintextKey as string; 

  return apiKey;
};

// Create indexes for frequently queried fields
userSchema.index({ role: 1 });
userSchema.index({ isEnabled: 1 });
userSchema.index({ isVerified: 1 });

export const User = mongoose.model<IUserDocument>("User", userSchema);
