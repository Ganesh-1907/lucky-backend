import { Router, Request, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, and, isNull, asc, sql } from 'drizzle-orm';
import { menuItems } from '../../db/schema/index';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleGuard';
import { ApiResponse } from '../utils/apiResponse';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query.menuItems.findMany({
      where: and(eq(menuItems.isActive, true), isNull(menuItems.parentId)),
      with: {
        children: {
          where: eq(menuItems.isActive, true),
          orderBy: [asc(menuItems.sortOrder)],
        },
      },
      orderBy: [asc(menuItems.sortOrder)],
    });

    ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
});

router.get('/all', authenticate, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query.menuItems.findMany({
      with: { children: { orderBy: [asc(menuItems.sortOrder)] } },
      where: isNull(menuItems.parentId),
      orderBy: [asc(menuItems.sortOrder)],
    });

    ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { label, url, parentId, column, icon, image, isActive } = req.body;

    const parentCondition = parentId ? eq(menuItems.parentId, parentId) : isNull(menuItems.parentId);
    const maxResult = await db.select({ max: sql<number>`max(${menuItems.sortOrder})` }).from(menuItems).where(parentCondition);
    const nextSort = (maxResult[0]?.max || 0) + 1;

    const result = await db.insert(menuItems).values({
      label,
      url,
      parentId: parentId || null,
      column,
      icon,
      image,
      isActive: isActive ?? true,
      sortOrder: nextSort,
    }).returning();

    ApiResponse.created(res, result[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { label, url, parentId, column, icon, image, isActive, sortOrder } = req.body;

    const result = await db.update(menuItems).set({ label, url, parentId, column, icon, image, isActive, sortOrder }).where(eq(menuItems.id, id)).returning();

    ApiResponse.success(res, result[0], 'Menu item updated');
  } catch (error) {
    next(error);
  }
});

router.put('/reorder/batch', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;

    await db.transaction(async (tx: any) => {
      for (const item of items) {
        await tx.update(menuItems).set({ sortOrder: item.sortOrder, parentId: item.parentId }).where(eq(menuItems.id, item.id));
      }
    });

    ApiResponse.success(res, null, 'Menu reordered');
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(menuItems).where(eq(menuItems.parentId, id));
    await db.delete(menuItems).where(eq(menuItems.id, id));

    ApiResponse.success(res, null, 'Menu item deleted');
  } catch (error) {
    next(error);
  }
});

export default router;
