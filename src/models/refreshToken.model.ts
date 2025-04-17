import mongoose, { Document, Schema } from "mongoose";

export interface IRefreshToken {
  userId: mongoose.Types.ObjectId;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface IRefreshTokenDocument extends IRefreshToken, Document {}

const refreshTokenSchema = new Schema<IRefreshTokenDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      // Set default to 3 days from now
      default: () => {
        const date = new Date();
        date.setDate(date.getDate() + 3);
        return date;
      },
    },
  },
  {
    timestamps: true,
  },
);

// Create TTL index that automatically deletes expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Create index for user-based queries
refreshTokenSchema.index({ userId: 1 });

export const RefreshToken = mongoose.model<IRefreshTokenDocument>(
  "RefreshToken",
  refreshTokenSchema,
);
