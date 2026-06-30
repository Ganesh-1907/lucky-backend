import { Router, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, and, desc } from 'drizzle-orm';
import { wishlists } from '../../db/schema/index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../utils/apiResponse';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await db.query.wishlists.findMany({
      where: eq(wishlists.userId, req.user!.id),
      with: {
        service: {
          with: {
            category: { columns: { id: true, name: true, slug: true } },
            vendor: { columns: { id: true, businessName: true, avgRating: true } },
          },
        },
      },
      orderBy: [desc(wishlists.createdAt)],
    });

    ApiResponse.success(res, result.map((w: any) => w.service));
  } catch (error) {
    next(error);
  }
});

router.post('/:serviceId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const serviceId = parseInt(req.params.serviceId);
    const userId = req.user!.id;

    const [existing] = await db.select().from(wishlists).where(
      and(eq(wishlists.userId, userId), eq(wishlists.serviceId, serviceId))
    ).limit(1);

    if (existing) {
      await db.delete(wishlists).where(
        and(eq(wishlists.userId, userId), eq(wishlists.serviceId, serviceId))
      );
      ApiResponse.success(res, { wishlisted: false }, 'Removed from wishlist');
    } else {
      await db.insert(wishlists).values({ userId, serviceId });
      ApiResponse.success(res, { wishlisted: true }, 'Added to wishlist');
    }
  } catch (error) {
    next(error);
  }
});

router.get('/check/:serviceId', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [exists] = await db.select().from(wishlists).where(
      and(eq(wishlists.userId, req.user!.id), eq(wishlists.serviceId, parseInt(req.params.serviceId)))
    ).limit(1);
    ApiResponse.success(res, { wishlisted: !!exists });
  } catch (error) {
    next(error);
  }
});

export default router;
