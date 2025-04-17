import express from 'express';
import authenticateJwt from '../middlewares/authMiddleware.js';
import { handleUploadErrors, uploadFiles, uploadImages } from '../middlewares/uploadMiddleware.js';
import { cleanupMedia, deleteProductMedia, uploadProductMedia, uploadThumbnail, deleteThumbnail, uploadPageMedia, listPageMedia, deletePageMedia, uploadCategoryThumbnail, deleteCategoryThumbnail } from '../controllers/mediaController.js';
import { isAdmin, isVerified } from '../middlewares/roleCheck.js';

const router = express.Router();

// Media routes for products
router.post('/product/:id/upload', authenticateJwt, isVerified, uploadImages, handleUploadErrors, uploadProductMedia);

router.post('/product/:id/thumbnail', authenticateJwt, isVerified, uploadImages, handleUploadErrors, uploadThumbnail);

router.delete('/product/:id/delete', authenticateJwt, isVerified, deleteProductMedia);

router.delete('/product/:id/thumbnail', authenticateJwt, isVerified, deleteThumbnail);

// Media routes for categories
router.post('/category/:id/thumbnail', authenticateJwt, isVerified, uploadImages, handleUploadErrors, uploadCategoryThumbnail);

router.delete('/category/:id/thumbnail', authenticateJwt, isVerified, deleteCategoryThumbnail);

// Cleanup route
router.delete('/cleanup', authenticateJwt, isVerified, isAdmin, cleanupMedia);

// Media routes for pages
router.post('/page', authenticateJwt, isVerified, isAdmin, uploadFiles, handleUploadErrors, uploadPageMedia);

router.get('/page', authenticateJwt, isVerified, isAdmin, listPageMedia);

router.delete('/page', authenticateJwt, isVerified, isAdmin, deletePageMedia);

export default router;