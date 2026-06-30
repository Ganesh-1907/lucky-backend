import { Router, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadMultiple, uploadSingle } from '../middleware/upload';
import { ApiResponse } from '../utils/apiResponse';

const router = Router();
const uploadDir = process.env.UPLOAD_DIR || './uploads';

router.post('/image', authenticate, uploadSingle, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { folder = 'images' } = req.body;
    const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
    const outputDir = path.join(uploadDir, folder);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, fileName);

    const image = sharp(req.file.path);
    const metadata = await image.metadata();

    const size = Math.min(metadata.width || 800, metadata.height || 800, 1200);

    await image
      .resize(size, size, { fit: 'cover', position: 'center' })
      .webp({ quality: 85 })
      .toFile(outputPath);

    fs.unlinkSync(req.file.path);

    const url = `/uploads/${folder}/${fileName}`;
    ApiResponse.success(res, { url, fileName }, 'Image uploaded');
  } catch (error) {
    next(error);
  }
});

router.post('/images', authenticate, uploadMultiple, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded' });
    }

    const { folder = 'images' } = req.body;
    const outputDir = path.join(uploadDir, folder);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const urls: string[] = [];

    for (const file of req.files) {
      const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
      const outputPath = path.join(outputDir, fileName);

      const image = sharp(file.path);
      const metadata = await image.metadata();
      const size = Math.min(metadata.width || 800, metadata.height || 800, 1200);

      await image
        .resize(size, size, { fit: 'cover', position: 'center' })
        .webp({ quality: 85 })
        .toFile(outputPath);

      fs.unlinkSync(file.path);
      urls.push(`/uploads/${folder}/${fileName}`);
    }

    ApiResponse.success(res, { urls }, `${urls.length} images uploaded`);
  } catch (error) {
    next(error);
  }
});

export default router;
