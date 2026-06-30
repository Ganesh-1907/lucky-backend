import { Router, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, and, desc, count } from 'drizzle-orm';
import { reviews, bookings } from '../../db/schema/index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

const router = Router();

router.post('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bookingId, rating, title, comment, images } = req.body;

    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId) });
    if (!booking || booking.clientId !== req.user!.id) {
      throw ApiError.notFound('Booking not found');
    }
    if (booking.status !== 'COMPLETED') {
      throw ApiError.badRequest('Can only review completed bookings');
    }

    const existingReview = await db.query.reviews.findFirst({ where: eq(reviews.bookingId, bookingId) });
    if (existingReview) {
      throw ApiError.conflict('Review already submitted');
    }

    const result = await db.insert(reviews).values({
      bookingId,
      clientId: req.user!.id,
      vendorId: booking.vendorId,
      serviceId: booking.serviceId,
      rating,
      title,
      comment,
      images: images ? JSON.stringify(images) : null,
      isApproved: false,
    }).returning();

    ApiResponse.created(res, result[0], 'Review submitted for approval');
  } catch (error) {
    next(error);
  }
});

router.get('/service/:serviceId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const serviceId = parseInt(req.params.serviceId);
    const { page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const [reviewsResult, totalResult] = await Promise.all([
      db.query.reviews.findMany({
        where: and(eq(reviews.serviceId, serviceId), eq(reviews.isApproved, true)),
        with: {
          client: { columns: { name: true, avatar: true } },
        },
        orderBy: [desc(reviews.createdAt)],
        offset: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(reviews).where(and(eq(reviews.serviceId, serviceId), eq(reviews.isApproved, true))),
    ]);

    const total = Number(totalResult[0].value);

    ApiResponse.paginated(res, reviewsResult, { page: pageNum, limit: limitNum, total });
  } catch (error) {
    next(error);
  }
});

export default router;
