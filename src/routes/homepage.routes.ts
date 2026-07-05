import { Router, Request, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, and, gte, asc, desc } from 'drizzle-orm';
import { homepageSections, banners, categories, services, cities, reviews } from '../../db/schema/index';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleGuard';
import { ApiResponse } from '../utils/apiResponse';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sections = await db.query.homepageSections.findMany({
      where: eq(homepageSections.isActive, true),
      orderBy: [asc(homepageSections.sortOrder)],
    });

    const result = [];

    for (const section of sections) {
      let data: any = null;

      switch (section.type) {
        case 'banner':
          data = await db.query.banners.findMany({
            where: and(eq(banners.isActive, true), eq(banners.position, 'HERO')),
            orderBy: [asc(banners.sortOrder)],
          });
          break;

        case 'categories':
          data = await db.query.categories.findMany({
            where: and(eq(categories.isActive, true)),
            orderBy: [asc(categories.sortOrder)],
            limit: section.config?.limit || 8,
          });
          break;

        case 'services': {
          const config = section.config || {};
          const conditions = [
            eq(services.status, 'APPROVED'),
            eq(services.isActive, true),
          ];

          if (config.tag === 'trending') conditions.push(eq(services.isTrending, true));
          else if (config.tag === 'bestseller') conditions.push(eq(services.isBestSeller, true));
          else if (config.tag === 'new') conditions.push(eq(services.isNewArrival, true));
          else if (config.tag === 'featured') conditions.push(eq(services.isFeatured, true));
          
          if (config.categoryId) {
            conditions.push(eq(services.categoryId, parseInt(config.categoryId)));
          }

          data = await db.query.services.findMany({
            where: and(...conditions),
            with: {
              category: { columns: { id: true, name: true, slug: true } },
              vendor: { columns: { id: true, businessName: true, avgRating: true } },
            },
            orderBy: [desc(services.bookingCount)],
            limit: config.limit || 8,
          });
          break;
        }

        case 'cities':
          data = await db.query.cities.findMany({
            where: eq(cities.isActive, true),
            orderBy: [asc(cities.sortOrder)],
            limit: section.config?.limit || 10,
          });
          break;

        case 'testimonials':
          data = await db.query.reviews.findMany({
            where: and(eq(reviews.isApproved, true), gte(reviews.rating, 4)),
            with: {
              client: { columns: { name: true, avatar: true } },
              service: { columns: { title: true } },
            },
            orderBy: [desc(reviews.createdAt)],
            limit: section.config?.limit || 6,
          });
          break;
      }

      result.push({ ...section, data });
    }

    ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
});

router.get('/sections', authenticate, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sections = await db.query.homepageSections.findMany({
      orderBy: [asc(homepageSections.sortOrder)],
    });
    ApiResponse.success(res, sections);
  } catch (error) {
    next(error);
  }
});

router.put('/sections/reorder/batch', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;

    await db.transaction(async (tx: any) => {
      for (const item of items) {
        await tx.update(homepageSections).set({ sortOrder: item.sortOrder }).where(eq(homepageSections.id, item.id));
      }
    });

    ApiResponse.success(res, null, 'Sections reordered');
  } catch (error) {
    next(error);
  }
});

router.put('/sections/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { isActive, title, subtitle, sortOrder, config } = req.body;

    const result = await db.update(homepageSections).set({
      isActive,
      title,
      subtitle,
      sortOrder,
      config: config || undefined,
    }).where(eq(homepageSections.id, id)).returning();

    ApiResponse.success(res, result[0], 'Section updated');
  } catch (error) {
    next(error);
  }
});

router.post('/sections', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, type, title, subtitle, sortOrder, isActive, config } = req.body;

    const result = await db.insert(homepageSections).values({
      name: name || type,
      type,
      title,
      subtitle,
      sortOrder: sortOrder || 99,
      isActive: isActive !== undefined ? isActive : true,
      config: config || null,
    }).returning();

    ApiResponse.success(res, result[0], 'Section created successfully', 201);
  } catch (error) {
    next(error);
  }
});

router.delete('/sections/:id', authenticate, requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    
    await db.delete(homepageSections).where(eq(homepageSections.id, id));
    
    ApiResponse.success(res, null, 'Section deleted successfully');
  } catch (error) {
    next(error);
  }
});

export default router;
