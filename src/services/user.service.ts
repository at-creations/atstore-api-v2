import mongoose from "mongoose";
import { IUserDocument, User } from "../models/user.model";
import { NotFoundError } from "../middleware/error.middleware";

export class UserService {
  public static async findUserByEmailOrUsername(
    login: string,
  ): Promise<IUserDocument | null> {
    return await User.findOne({
      $or: [{ email: login }, { username: login }],
    });
  }

  public static async findUserById(id: string | mongoose.Types.ObjectId) {
    return await User.findById(id);
  }

  public static async replacePassword(
    user: IUserDocument,
    password: string,
    newPassword: string,
  ): Promise<void> {
    const valid = await user.comparePassword(password);
    if (!valid) {
      throw new Error("Invalid current password");
    }

    if (newPassword === password) {
      throw new Error(
        "New password cannot be the same as the current password",
      );
    }

    user.password = newPassword;
    await user.save();
  }
}
