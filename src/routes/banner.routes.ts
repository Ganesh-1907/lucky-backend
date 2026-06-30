import { Router, Request, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, and, asc } from 'drizzle-orm';
import { banners } from '../../db/schema/index';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleGuard';
import { ApiResponse } from '../utils/apiResponse';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { position } = req.query;
    const conditions: any[] = [eq(banners.isActive, true)];
    if (position) conditions.push(eq(banners.position, position as string));

    const result = await db.select().from(banners).where(and(...conditions)).orderBy(asc(banners.sortOrder));

    ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [banner] = await db.insert(banners).values(req.body).returning();
    ApiResponse.created(res, banner);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [banner] = await db.update(banners).set(req.body).where(eq(banners.id, parseInt(req.params.id))).returning();
    ApiResponse.success(res, banner, 'Banner updated');
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.delete(banners).where(eq(banners.id, parseInt(req.params.id)));
    ApiResponse.success(res, null, 'Banner deleted');
  } catch (error) {
    next(error);
  }
});

export default router;
