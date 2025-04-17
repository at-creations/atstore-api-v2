import mongoose from "mongoose";
import { config } from "./env";

export const connectToDatabase = async (): Promise<void> => {
  try {
    await mongoose.connect(config.DATABASE_URL as string);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
};

export const disconnectFromDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    console.log("MongoDB disconnected");
  } catch (error) {
    throw error;
  }
};
