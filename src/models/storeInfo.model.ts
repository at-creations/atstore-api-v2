import mongoose, { Document, Schema } from "mongoose";

export interface BusinessHours {
  day: string;
  openTime: string;
  closeTime: string;
}

export interface IStoreInfo {
  email: string;
  phone: string;
  address: string;
  businessHours: BusinessHours[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IStoreInfoDocument extends IStoreInfo, Document {
  _id: mongoose.Types.ObjectId;
}

const businessHoursSchema = new Schema<BusinessHours>(
  {
    day: {
      type: String,
      required: true,
      enum: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
    },
    openTime: {
      type: String,
      required: true,
      validate: {
        validator: function (v: string) {
          // Allow "Closed" as a valid input or time in HH:MM format
          return v === "closed" || /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: "Open time must be in 'HH:MM' format or 'Closed'",
      },
    },
    closeTime: {
      type: String,
      required: true,
      validate: {
        validator: function (v: string) {
          // Allow "Closed" as a valid input or time in HH:MM format
          return v === "closed" || /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
        },
        message: "Close time must be in 'HH:MM' format or 'Closed'",
      },
    },
  },
  { _id: false }
);

const storeInfoSchema = new Schema<IStoreInfoDocument>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        "Invalid email format",
      ],
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    businessHours: {
      type: [businessHoursSchema],
      required: true,
      validate: {
        validator: function (hours: BusinessHours[]) {
          // Check for duplicate days
          const days = hours.map((h) => h.day);
          return new Set(days).size === days.length;
        },
        message: "Business hours cannot contain duplicate days",
      },
    },
  },
  {
    timestamps: true,
  }
);

export const StoreInfo = mongoose.model<IStoreInfoDocument>(
  "StoreInfo",
  storeInfoSchema
);
