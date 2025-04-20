import mongoose, { Document, Schema } from "mongoose";
import { normalizeVietnamese } from "../utils/text.utils";
import { EmbeddingService } from "../services/embedding.service";

export interface IProduct {
  name: string;
  nameVI: string;
  description: string;
  descriptionVI: string;
  normalizedNameVI: string;
  normalizedDescriptionVI: string;
  price: number;
  views: number;
  recentViews: number; // New field for views in last 7 days
  featured: boolean;
  thumbnail: string;
  images: string[];
  categoryIds: string[];
  stock: number;
  createdAt: Date;
  updatedAt: Date;
  embedding?: number[];
}

export interface IProductDocument extends IProduct, Document {
  _id: mongoose.Types.ObjectId; // Explicitly define the _id type
}

const productSchema = new Schema<IProductDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameVI: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    descriptionVI: {
      type: String,
      default: "",
      trim: true,
    },
    normalizedNameVI: {
      type: String,
      default: "",
      trim: true,
    },
    normalizedDescriptionVI: {
      type: String,
      default: "",
      trim: true,
    },
    price: {
      type: Number,
      required: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    recentViews: {
      type: Number,
      default: 0,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    thumbnail: {
      type: String,
      default: null,
    },
    images: {
      type: [String],
      default: [],
    },
    categoryIds: {
      type: [mongoose.Types.ObjectId],
      default: [],
    },
    stock: {
      type: Number,
      required: true,
      default: 1,
    },
    embedding: {
      type: [Number],
      default: null,
    },
  },
  { timestamps: true }
);

productSchema.pre("save", async function (next) {
  this.normalizedNameVI = normalizeVietnamese(this.nameVI);
  this.normalizedDescriptionVI = normalizeVietnamese(this.descriptionVI);

  // Generate embeddings for the product
  try {
    // Only include product's own text fields for embedding
    const textsToEmbed = [
      this.name,
      this.nameVI,
      this.description,
      this.descriptionVI,
    ].filter((text) => text && text.trim().length > 0); // Filter out empty texts

    // Only generate embedding if we have texts to embed
    if (textsToEmbed.length > 0) {
      // Pass the array directly to the embedding service without joining
      this.embedding = await EmbeddingService.getEmbedding(textsToEmbed);
    }
  } catch (error) {
    console.error("Error generating product embedding:", error);
    // Continue saving even if embedding fails
  }

  next();
});

productSchema.index({
  name: "text",
  normalizedNameVI: "text",
  nameVI: "text",
  normalizedDescriptionVI: "text",
});
productSchema.index({ price: 1 });
productSchema.index({ views: 1 });
productSchema.index({ recentViews: 1 }); // Index for recent views
productSchema.index({ featured: 1 });
productSchema.index({ categories: 1 });
productSchema.index({ stock: 1 });

export const Product = mongoose.model<IProductDocument>(
  "Product",
  productSchema
);
