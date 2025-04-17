import config from "../config/env";
import {
  PASSWORD_VALIDATION_REGEX,
  User,
  UserResponse,
  VALID_ROLES,
} from "../models/user.model";
import { BadRequestError, DatabaseError } from "../middleware/error.middleware";
import { DbService } from "./db.service";

export class AuthService {
  public static validatePassword(password: string): boolean {
    return PASSWORD_VALIDATION_REGEX.test(password);
  }

  public static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  public static validateUsername(username: string): boolean {
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    return usernameRegex.test(username);
  }

  public static validateName(name: string): boolean {
    // Allow letters (including Vietnamese characters), spaces, hyphens, and apostrophes
    // Vietnamese characters include: ăâêôơưđ and their uppercase forms, plus letters with diacritics
    const nameRegex =
      /^[a-zA-Z0-9\s'\-àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]{2,50}$/;

    // Additional check: prevent consecutive spaces, hyphens or apostrophes
    if (/\s{2,}|'{2,}|-{2,}/.test(name)) {
      return false;
    }

    // Ensure name doesn't begin or end with space, hyphen or apostrophe
    if (/^[\s'-]|[\s'-]$/.test(name)) {
      return false;
    }

    return nameRegex.test(name);
  }

  public static async validateRole(role: string): Promise<boolean> {
    return VALID_ROLES.includes(role);
  }

  public static async emailExists(email: string): Promise<boolean> {
    const existingEmail = await User.findOne({ email });
    return !!existingEmail;
  }

  public static async usernameExists(username: string): Promise<boolean> {
    const existingUsername = await User.findOne({ username });
    return !!existingUsername;
  }

  public static async CreateUser(
    email: string,
    username: string,
    password: string,
    name: string,
    role?: string,
    isEnabled?: boolean
  ): Promise<UserResponse> {
    try {
      // Validate input parameters first (400 errors)
      if (!this.validateEmail(email)) {
        throw new BadRequestError("Invalid email address");
      }
      if (!this.validateUsername(username)) {
        throw new BadRequestError("Invalid username");
      }
      if (!this.validatePassword(password)) {
        throw new BadRequestError("Invalid password");
      }
      if (!this.validateName(name)) {
        throw new BadRequestError("Invalid name");
      }
      if (role && !(await this.validateRole(role))) {
        throw new BadRequestError("Invalid role");
      }

      // Check for duplicates (needs database access, but still a 400 error)
      return await DbService.executeDbOperation(async () => {
        if (await this.emailExists(email)) {
          throw new BadRequestError("Email address already in use");
        }
        if (await this.usernameExists(username)) {
          throw new BadRequestError("Username already in use");
        }

        // Create user (500 error if database connection fails)
        const user = new User({
          email,
          username,
          password,
          name,
          role,
          isEnabled: isEnabled ?? true,
        });

        await user.save();
        const userObj = user.toObject();

        return {
          id: userObj._id,
          _id: userObj._id,
          email: userObj.email,
          username: userObj.username,
          createdAt: userObj.createdAt,
          updatedAt: userObj.updatedAt,
          role: userObj.role,
          name: userObj.name,
          isEnabled: userObj.isEnabled,
          isVerified: userObj.isVerified,
        };
      });
    } catch (error: any) {
      // If it's already an AppError (like BadRequestError or DatabaseError), just rethrow
      if (error.statusCode) {
        throw error;
      }

      // Otherwise wrap in a DatabaseError
      throw new DatabaseError("Error creating user: " + error.message);
    }
  }

  public static validateRegisterSecret(secret: string): boolean {
    return secret === config.REGISTER_SECRET;
  }
}
