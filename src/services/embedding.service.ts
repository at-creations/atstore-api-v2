import { GoogleGenAI } from "@google/genai";
import config from "../config/env";
import { InternalServerError } from "../middleware/error.middleware";

export class EmbeddingService {
  private static ai = new GoogleGenAI({
    apiKey: config.GEMINI_API_KEY,
  });

  /**
   * Function to get the embedding of a text using Google GenAI
   * @param text The text to get the embedding for. Can be a string or an array of strings.
   * @param dimension The dimensionality of the embedding. Default is 768.
   * @returns A promise that resolves to an array of numbers representing the embedding.
   */
  public static async getEmbedding(text: string[] | string, dimension: number = 768): Promise<number[]> {
    if (!text) {
      throw new Error("Text is required to generate an embedding.");
    }
    if (Array.isArray(text)) {
      // Array need to be non-empty and contain only strings
      if (text.length === 0 || !text.every((item) => typeof item === "string")) {
        throw new Error("Text array must be non-empty and contain only strings.");
      }
    }

    const response = await this.ai.models.embedContent({
      model: "text-embedding-004",
      contents: text,
      config: {
        outputDimensionality: dimension,
      }
    });

    if (!response.embeddings) {
      throw new InternalServerError("Failed to get embeddings from Google GenAI.");
    }
    return response.embeddings[0].values as number[];
  }
}
