import mongoose, { Document, Schema } from "mongoose";

/**
 * Product view interface
 */
export interface IProductView {
  productId: mongoose.Types.ObjectId;
  userId?: mongoose.Types.ObjectId;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  hostname?: string;
  referrer?: string;
  timestamp: Date;
}

/**
 * Product view document interface
 */
export interface IProductViewDocument extends IProductView, Document {
  _id: mongoose.Types.ObjectId;
}

/**
 * Product view schema
 */
const productViewSchema = new Schema<IProductViewDocument>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    sessionId: {
      type: String,
      index: true,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    hostname: {
      type: String,
    },
    referrer: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false }
);

// Create TTL index for automatic removal of views older than 7 days
productViewSchema.index(
  { timestamp: -1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 }
);

export const ProductView = mongoose.model<IProductViewDocument>(
  "ProductView",
  productViewSchema
);
