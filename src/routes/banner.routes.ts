import { Router, Request, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, and, asc, desc, ilike, or, sql, ne } from 'drizzle-orm';
import { banners } from '../../db/schema/index';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleGuard';
import { ApiResponse } from '../utils/apiResponse';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { position, status, search, page = '1', limit = '10', sort = 'newest' } = req.query;
    
    const conditions: any[] = [];
    
    if (status === 'ACTIVE') {
      conditions.push(eq(banners.isActive, true));
      conditions.push(or(sql`${banners.startDate} IS NULL`, sql`${banners.startDate} <= NOW()`));
      conditions.push(or(sql`${banners.endDate} IS NULL`, sql`${banners.endDate} >= NOW()`));
    } else if (status === 'INACTIVE') {
      conditions.push(eq(banners.isActive, false));
    } else if (status === 'EXPIRED') {
      conditions.push(sql`${banners.endDate} < NOW()`);
    } else if (status === 'UPCOMING') {
      conditions.push(sql`${banners.startDate} > NOW()`);
    }

    const validPositions = ['HERO', 'SIDEBAR', 'FOOTER', 'POPUP'];
    if (position && position !== 'ALL' && validPositions.includes(position as string)) {
      conditions.push(eq(banners.position, position as any));
    }
    
    if (search) {
      const s = `%${search}%`;
      conditions.push(or(
        ilike(banners.title, s), 
        ilike(banners.link, s),
        ilike(banners.subtitle, s)
      ));
    }
    
    let orderByCondition = desc(banners.createdAt);
    if (sort === 'newest') orderByCondition = desc(banners.createdAt);
    else if (sort === 'oldest') orderByCondition = asc(banners.createdAt);
    else if (sort === 'title_asc') orderByCondition = asc(banners.title);
    else if (sort === 'title_desc') orderByCondition = desc(banners.title);
    else if (sort === 'order') orderByCondition = asc(banners.sortOrder);
    else if (sort === 'updated') orderByCondition = desc(banners.updatedAt);

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = (pageNum - 1) * limitNum;

    const baseQuery = db.select().from(banners);
    if (conditions.length > 0) {
      baseQuery.where(and(...conditions));
    }
    
    // Get total count
    const countQuery = db.select({ count: sql<number>`count(*)` }).from(banners);
    if (conditions.length > 0) {
      countQuery.where(and(...conditions));
    }
    const [{ count }] = await countQuery;
    const total = Number(count);
    
    // Get paginated data
    const paginated = await baseQuery
      .orderBy(orderByCondition)
      .limit(limitNum)
      .offset(offsetNum);

    res.json({
      success: true,
      data: paginated,
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [banner] = await db.select().from(banners).where(eq(banners.id, parseInt(req.params.id)));
    if (!banner) {
      return res.status(404).json({ success: false, error: 'Banner not found' });
    }
    ApiResponse.success(res, banner);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, position, sortOrder } = req.body;
    
    // Validation: No duplicate banner title within same position
    const existingTitle = await db.select().from(banners).where(and(eq(banners.title, title), eq(banners.position, position)));
    if (existingTitle.length > 0) {
      return res.status(400).json({ success: false, error: 'Banner title already exists for this position' });
    }
    
    // Validation: Prevent duplicate display orders within the same banner position
    if (sortOrder !== undefined && sortOrder !== null) {
      const existingOrder = await db.select().from(banners).where(and(eq(banners.sortOrder, sortOrder), eq(banners.position, position)));
      if (existingOrder.length > 0) {
        return res.status(400).json({ success: false, error: 'A banner with this order number already exists for this position' });
      }
    }

    const [banner] = await db.insert(banners).values(req.body).returning();
    ApiResponse.created(res, banner);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bannerId = parseInt(req.params.id);
    const { title, position, sortOrder } = req.body;
    
    // Validation: No duplicate banner title within same position
    if (title && position) {
      const existingTitle = await db.select().from(banners).where(and(eq(banners.title, title), eq(banners.position, position), ne(banners.id, bannerId)));
      if (existingTitle.length > 0) {
        return res.status(400).json({ success: false, error: 'Banner title already exists for this position' });
      }
    }
    
    // Validation: Prevent duplicate display orders within the same banner position
    if (sortOrder !== undefined && sortOrder !== null && position) {
      const existingOrder = await db.select().from(banners).where(and(eq(banners.sortOrder, sortOrder), eq(banners.position, position), ne(banners.id, bannerId)));
      if (existingOrder.length > 0) {
        return res.status(400).json({ success: false, error: 'A banner with this order number already exists for this position' });
      }
    }

    const { id, createdAt, updatedAt, ...updateData } = req.body;
    
    const [banner] = await db.update(banners).set({
      ...updateData,
      updatedAt: new Date().toISOString()
    }).where(eq(banners.id, bannerId)).returning();
    
    ApiResponse.success(res, banner, 'Banner updated');
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/status', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isActive } = req.body;
    const [banner] = await db.update(banners).set({ 
      isActive,
      updatedAt: new Date().toISOString()
    }).where(eq(banners.id, parseInt(req.params.id))).returning();
    ApiResponse.success(res, banner, 'Banner status updated');
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
