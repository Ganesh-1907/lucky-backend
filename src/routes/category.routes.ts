import { Router, Request, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, and, isNull, asc, inArray } from 'drizzle-orm';
import { categories, services } from '../../db/schema/index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleGuard';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { generateSlug } from '../utils/helpers';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query.categories.findMany({
      where: and(eq(categories.isActive, true), isNull(categories.parentId)),
      with: {
        children: {
          where: eq(categories.isActive, true),
          orderBy: [asc(categories.sortOrder)],
        },
      },
      orderBy: [asc(categories.sortOrder)],
    });

    ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
});

router.get('/all', authenticate, requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query.categories.findMany({
      with: { children: { orderBy: [asc(categories.sortOrder)] } },
      orderBy: [asc(categories.sortOrder)],
    });

    ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.query.categories.findFirst({
      where: eq(categories.slug, req.params.slug),
      with: {
        children: {
          where: eq(categories.isActive, true),
          orderBy: [asc(categories.sortOrder)],
        },
        parent: true,
      },
    });

    if (!result) {
      throw ApiError.notFound('Category not found');
    }

    ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description, image, icon, parentId, isActive, seoTitle, seoDescription } = req.body;
    const slug = generateSlug(name);

    const result = await db.insert(categories).values({
      name,
      slug,
      description,
      image,
      icon,
      parentId: parentId || null,
      isActive: isActive ?? true,
      seoTitle,
      seoDescription,
    }).returning();

    ApiResponse.created(res, result[0]);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, image, icon, parentId, isActive, sortOrder, seoTitle, seoDescription } = req.body;

    const data: any = { description, image, icon, parentId, isActive, sortOrder, seoTitle, seoDescription };
    if (name) {
      data.name = name;
      data.slug = generateSlug(name);
    }

    const result = await db.update(categories).set(data).where(eq(categories.id, id)).returning();

    ApiResponse.success(res, result[0], 'Category updated');
  } catch (error) {
    next(error);
  }
});

router.put('/reorder/batch', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;

    await db.transaction(async (tx: any) => {
      for (const item of items) {
        await tx.update(categories).set({ sortOrder: item.sortOrder }).where(eq(categories.id, item.id));
      }
    });

    ApiResponse.success(res, null, 'Categories reordered');
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);

    // Business Logic: Find all children of this category
    const children = await db.query.categories.findMany({
      where: eq(categories.parentId, id),
    });
    
    const categoryIdsToCheck = [id, ...children.map(c => c.id)];

    // Check if the category or any of its children have associated services
    const hasServices = await db.query.services.findFirst({
      where: inArray(services.categoryId, categoryIdsToCheck),
    });

    if (hasServices) {
      throw ApiError.badRequest('Cannot delete this category because it (or its sub-categories) has active services. Please reassign the services first.');
    }

    // Safe to delete: Delete children first, then the parent
    await db.transaction(async (tx: any) => {
      if (children.length > 0) {
        await tx.delete(categories).where(eq(categories.parentId, id));
      }
      await tx.delete(categories).where(eq(categories.id, id));
    });

    ApiResponse.success(res, null, 'Category and sub-categories deleted successfully');
  } catch (error) {
    next(error);
  }
});

export default router;
