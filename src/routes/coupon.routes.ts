import { Router, Request, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq } from 'drizzle-orm';
import { coupons } from '../../db/schema/index';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

const router = Router();

router.post('/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, orderAmount } = req.body;

    const [coupon] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);

    if (!coupon || !coupon.isActive) {
      throw ApiError.notFound('Invalid coupon code');
    }

    if (new Date() < new Date(coupon.validFrom) || new Date() > new Date(coupon.validTo)) {
      throw ApiError.badRequest('Coupon has expired');
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw ApiError.badRequest('Coupon usage limit reached');
    }

    if (orderAmount < Number(coupon.minOrder)) {
      throw ApiError.badRequest(`Minimum order amount is ₹${coupon.minOrder}`);
    }

    let discount = 0;
    if (coupon.type === 'PERCENTAGE') {
      discount = (orderAmount * Number(coupon.value)) / 100;
      if (coupon.maxDiscount) {
        discount = Math.min(discount, Number(coupon.maxDiscount));
      }
    } else {
      discount = Number(coupon.value);
    }

    ApiResponse.success(res, {
      code: coupon.code,
      type: coupon.type,
      value: Number(coupon.value),
      discount: Math.round(discount),
      description: coupon.description,
    }, 'Coupon applied!');
  } catch (error) {
    next(error);
  }
});

export default router;
