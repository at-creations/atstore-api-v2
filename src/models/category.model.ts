import mongoose, { Document, Schema } from "mongoose";
import { generateSlug, normalizeVietnamese } from "../utils/text.utils";

export interface ICategory {
  name: string;
  nameVI: string;
  description: string;
  descriptionVI: string;
  normalizedNameVI: string;
  normalizedDescriptionVI: string;
  slug: string;
  thumbnail: string;
  parent: string | null;
}

export interface ICategoryDocument extends ICategory, Document {
  _id: mongoose.Types.ObjectId;
}

const categorySchema = new Schema<ICategoryDocument>(
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
      default: "",
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
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    thumbnail: {
      type: String,
      default: null,
    },
    parent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Generate unique slug before saving
categorySchema.pre<ICategoryDocument>("save", async function (next) {
  try {
    // Normalize Vietnamese text
    this.normalizedNameVI = normalizeVietnamese(this.nameVI);
    this.normalizedDescriptionVI = normalizeVietnamese(this.descriptionVI);

    // Only generate slug for new documents or when name changes
    if (this.isNew || this.isModified("name")) {
      // Generate base slug
      const baseSlug = this.slug || generateSlug(this.name);

      // Check if slug already exists
      let slug = baseSlug;
      let counter = 2;
      let slugExists = true;

      // Keep checking until we find a unique slug
      while (slugExists) {
        // Check if slug already exists (exclude current document when updating)
        const count = await mongoose.models.Category.countDocuments({
          slug: slug,
          _id: { $ne: this._id },
        });

        if (count === 0) {
          // Unique slug found
          slugExists = false;
        } else {
          // Add counter to slug and try again
          slug = `${baseSlug}-${counter}`;
          counter++;
        }
      }

      // Set the unique slug
      this.slug = slug;
    }

    next();
  } catch (error) {
    next(error as Error);
  }
});

// Create indexes for better performance
categorySchema.index({
  name: "text",
  normalizedNameVI: "text",
  nameVI: "text",
  description: "text",
  normalizedDescriptionVI: "text",
  descriptionVI: "text",
});
categorySchema.index({ parent: 1 });

export const Category = mongoose.model<ICategoryDocument>(
  "Category",
  categorySchema
);
