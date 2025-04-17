import express from "express";
import { ApiKeyController } from "../controllers/apikey.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = express.Router();

/**
 * @route   POST /apikeys
 * @desc    Generate a new API key
 * @access  Private
 */
router.post("/", authenticate, ApiKeyController.createApiKey);

/**
 * @route   GET /apikeys
 * @desc    Get all API keys for authenticated user
 * @access  Private
 */
router.get("/", authenticate, ApiKeyController.getApiKeys);

/**
 * @route   DELETE /apikeys/:name
 * @desc    Delete an API key by name
 * @access  Private
 */
router.delete("/:name", authenticate, ApiKeyController.deleteApiKey);

export const apiKeyRoutes = router;
