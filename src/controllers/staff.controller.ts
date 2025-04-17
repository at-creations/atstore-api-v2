import { Request, Response } from "express";
import { User, UserResponse, VALID_ROLES } from "../models/user.model";
import { paginatedResponse, successResponse } from "../models/response.model";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "../middleware/error.middleware";
import { DbService } from "../services/db.service";
import { asyncHandler } from "../utils/async-handler.util";

/**
 * Get users with pagination, filtering, sorting and search
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  // Parse query parameters with type safety
  const pageSize =
    parseInt((req.query.limit ?? req.query.pageSize) as string) || 10;
  const page = parseInt(req.query.page as string) || 1;
  const offset = parseInt(req.query.offset as string) || (page - 1) * pageSize;
  const role = req.query.role as string;
  const search = (req.query.search as string) || "";
  const sort = (req.query.sort as string) || "role";
  const order = (req.query.order as string) === "desc" ? -1 : 1;
  const isEnabled =
    req.query.isEnabled !== undefined
      ? req.query.isEnabled === "true"
      : undefined;

  // Build filter conditions
  const filter: Record<string, any> = {};

  // Filter by role if provided and valid
  if (role && VALID_ROLES.includes(role)) {
    filter.role = role;
  }

  // Filter by isEnabled status if provided
  if (isEnabled !== undefined) {
    filter.isEnabled = isEnabled;
  }

  // Add search functionality
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { username: { $regex: search, $options: "i" } },
    ];
  }

  // Validate sort field (security measure against NoSQL injection)
  const allowedSortFields = [
    "name",
    "email",
    "username",
    "role",
    "createdAt",
    "updatedAt",
    "isEnabled",
  ];
  if (!allowedSortFields.includes(sort)) {
    throw new BadRequestError("Invalid sort field");
  }

  // Create sort object
  const sortOptions: Record<string, 1 | -1> = {};
  sortOptions[sort] = order;

  // Execute the query with pagination using DbService
  const [users, totalCount] = await DbService.executeDbOperation(async () => {
    return await Promise.all([
      User.find(filter)
        .select("-password -__v") // Exclude sensitive fields
        .sort(sortOptions)
        .skip(offset)
        .limit(pageSize)
        .lean(),
      User.countDocuments(filter),
    ]);
  });

  // Map to UserResponse interface
  const userResponses: UserResponse[] = users.map((user) => ({
    ...user,
    id: user._id,
  }));

  // Send paginated response
  return res.status(200).json(
    paginatedResponse(
      "Users retrieved successfully",
      userResponses,
      page,
      pageSize,
      totalCount,
      {
        filteredBy: Object.keys(filter).length > 0 ? filter : undefined,
        sortedBy: sort,
        sortOrder: order === 1 ? "asc" : "desc",
      }
    )
  );
});

export const disableUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;

  if (!DbService.isValidObjectId(userId)) {
    throw new BadRequestError("Invalid user ID");
  }

  // Use findOneAndUpdate for atomic updates with DbService
  const updatedUser = await DbService.executeDbOperation(async () => {
    const user = await User.findOneAndUpdate(
      { _id: userId },
      { isEnabled: false },
      { new: true, runValidators: true }
    );

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  });

  return res.status(200).json(successResponse("User disabled successfully"));
});

export const enableUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;

  if (!DbService.isValidObjectId(userId)) {
    throw new BadRequestError("Invalid user ID");
  }

  // Use findOneAndUpdate for atomic updates with DbService
  const updatedUser = await DbService.executeDbOperation(async () => {
    const user = await User.findOneAndUpdate(
      { _id: userId },
      { isEnabled: true },
      { new: true, runValidators: true }
    );

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  });

  return res.status(200).json(successResponse("User enabled successfully"));
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const { adminPassword } = req.body;

  // Validate admin password is provided
  if (!adminPassword) {
    throw new BadRequestError("Admin password is required to delete a user");
  }

  if (!DbService.isValidObjectId(userId)) {
    throw new BadRequestError("Invalid user ID");
  }

  // Get the current admin user from the request
  const admin = req.user;
  if (!admin) {
    throw new UnauthorizedError("Authentication required");
  }

  // Verify the provided password matches the admin's password
  const isPasswordValid = await admin.comparePassword(adminPassword);
  if (!isPasswordValid) {
    throw new UnauthorizedError("Invalid admin password");
  }

  // Use findOneAndDelete with DbService
  await DbService.executeDbOperation(async () => {
    const deletedUser = await User.findOneAndDelete({ _id: userId });

    if (!deletedUser) {
      throw new NotFoundError("User not found");
    }

    return deletedUser;
  });

  return res.status(200).json(successResponse("User deleted successfully"));
});

export const changeRole = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const role = req.body.role;

  if (!VALID_ROLES.includes(role)) {
    throw new BadRequestError("Invalid role");
  }

  if (!DbService.isValidObjectId(userId)) {
    throw new BadRequestError("Invalid user ID");
  }

  // Use findOneAndUpdate with DbService
  await DbService.executeDbOperation(async () => {
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId },
      { role },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      throw new NotFoundError("User not found");
    }

    return updatedUser;
  });

  return res
    .status(200)
    .json(successResponse("User role updated successfully"));
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;

  // Validate user ID
  if (!DbService.isValidObjectId(userId)) {
    throw new BadRequestError("Invalid user ID");
  }

  // Find user with DbService
  const user = await DbService.executeDbOperation(async () => {
    const user = await User.findById(userId).select("-password -__v").lean();

    if (!user) {
      throw new NotFoundError("User not found");
    }

    return user;
  });

  const userResponse: UserResponse = {
    ...user,
    id: user._id,
  };

  return res
    .status(200)
    .json(successResponse("User retrieved successfully", userResponse));
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id;
  const updatedFields = req.body;

  if (!DbService.isValidObjectId(userId)) {
    throw new BadRequestError("Invalid user ID");
  }

  // Remove sensitive fields that shouldn't be directly updated
  delete updatedFields.password;
  delete updatedFields.username;

  // Use findOneAndUpdate with DbService
  const updatedUser = await DbService.executeDbOperation(async () => {
    // First, get the current user to check if email is changing
    const currentUser = await User.findById(userId);

    if (!currentUser) {
      throw new NotFoundError("User not found");
    }

    // Check if email is being updated
    if (updatedFields.email && updatedFields.email !== currentUser.email) {
      // Validate email format
      if (
        !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(
          updatedFields.email
        )
      ) {
        throw new BadRequestError("Invalid email format");
      }

      // Check if email already exists
      const existingUser = await User.findOne({ email: updatedFields.email });
      if (existingUser) {
        throw new BadRequestError("Email already in use");
      }

      // Set isVerified to false since email is changing
      updatedFields.isVerified = false;
    }

    // Update the user with all updated fields
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId },
      updatedFields,
      { new: true, runValidators: true }
    ).select("-password -__v").lean();

    return updatedUser;
  });

  if (!updatedUser) {
    throw new NotFoundError("User not found");
  }

  const userResponse: UserResponse = {
    ...updatedUser,
    id: updatedUser._id,
  };

  return res
    .status(200)
    .json(successResponse("User updated successfully", userResponse));
});
