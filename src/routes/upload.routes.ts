import { Router, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadMultiple, uploadSingle } from '../middleware/upload';
import { ApiResponse } from '../utils/apiResponse';
import { uploadToR2, isR2Configured } from '../services/r2.service';

const router = Router();
const uploadDir = process.env.UPLOAD_DIR || './uploads';

async function processAndUpload(filePath: string, folder: string): Promise<string> {
  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
  const key = `${folder}/${fileName}`;

  const image = sharp(filePath);
  const metadata = await image.metadata();
  const size = Math.min(metadata.width || 800, metadata.height || 800, 1200);

  const buffer = await image
    .resize(size, size, { fit: 'cover', position: 'center' })
    .webp({ quality: 85 })
    .toBuffer();

  fs.unlinkSync(filePath);

  if (isR2Configured()) {
    return await uploadToR2(key, buffer, 'image/webp');
  }

  // Fallback: save locally
  const outputDir = path.join(uploadDir, folder);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(path.join(outputDir, fileName), buffer);
  return `/uploads/${folder}/${fileName}`;
}

router.post('/image', authenticate, uploadSingle, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { folder = 'images' } = req.body;
    const url = await processAndUpload(req.file.path, folder);

    ApiResponse.success(res, { url, fileName: path.basename(url) }, 'Image uploaded');
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
    const urls: string[] = [];

    for (const file of req.files) {
      const url = await processAndUpload(file.path, folder);
      urls.push(url);
    }

    ApiResponse.success(res, { urls }, `${urls.length} images uploaded`);
  } catch (error) {
    next(error);
  }
});

export default router;
