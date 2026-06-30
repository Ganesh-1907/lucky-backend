import { Router, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq } from 'drizzle-orm';
import { bookings, services, payments } from '../../db/schema/index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

const router = Router();

// POST /api/payments/create-order — Create Razorpay order
router.post('/create-order', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { bookingId, type = 'ADVANCE' } = req.body;

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) throw ApiError.notFound('Booking not found');

    let amount: number;
    if (type === 'ADVANCE') {
      const [service] = await db.select().from(services).where(eq(services.id, booking.serviceId)).limit(1);
      amount = (Number(booking.totalAmount) * (Number(service?.minAdvancePercent) || 50)) / 100;
    } else {
      amount = Number(booking.remainingAmount);
    }

    // Razorpay integration (when keys are available)
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (keyId && keySecret) {
      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });

      const order = await razorpay.orders.create({
        amount: Math.round(amount * 100), // paise
        currency: 'INR',
        receipt: booking.bookingNumber,
        notes: {
          bookingId: booking.id,
          type,
        },
      });

      // Create payment record
      await db.insert(payments).values({
        bookingId: booking.id,
        razorpayOrderId: order.id,
        amount: String(amount),
        type: type as any,
        status: 'PENDING',
      });

      ApiResponse.success(res, {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId,
        bookingNumber: booking.bookingNumber,
      });
    } else {
      // Demo mode without Razorpay keys
      const demoOrderId = `demo_${Date.now()}`;
      await db.insert(payments).values({
        bookingId: booking.id,
        razorpayOrderId: demoOrderId,
        amount: String(amount),
        type: type as any,
        status: 'PENDING',
      });

      ApiResponse.success(res, {
        orderId: demoOrderId,
        amount: Math.round(amount * 100),
        currency: 'INR',
        keyId: 'demo_key',
        bookingNumber: booking.bookingNumber,
        demoMode: true,
      }, 'Demo mode: Razorpay keys not configured');
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/payments/verify — Verify payment
router.post('/verify', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, demoMode } = req.body;

    const [payment] = await db.select().from(payments).where(eq(payments.razorpayOrderId, razorpayOrderId)).limit(1);
    if (!payment) throw ApiError.notFound('Payment not found');

    if (demoMode) {
      // Demo verification
      await db.update(payments).set({
        razorpayPaymentId: `demo_pay_${Date.now()}`,
        status: 'COMPLETED',
      }).where(eq(payments.id, payment.id));
    } else {
      // Real Razorpay signature verification
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');

      if (expectedSignature !== razorpaySignature) {
        throw ApiError.badRequest('Invalid payment signature');
      }

      await db.update(payments).set({
        razorpayPaymentId,
        razorpaySignature,
        status: 'COMPLETED',
      }).where(eq(payments.id, payment.id));
    }

    // Update booking
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, payment.bookingId)).limit(1);
    if (booking) {
      const newAdvancePaid = Number(booking.advancePaid) + Number(payment.amount);
      const newRemaining = Number(booking.totalAmount) - newAdvancePaid;

      await db.update(bookings).set({
        advancePaid: String(newAdvancePaid),
        remainingAmount: String(Math.max(0, newRemaining)),
        status: booking.status === 'PENDING' ? 'CONFIRMED' : booking.status,
      }).where(eq(bookings.id, booking.id));
    }

    ApiResponse.success(res, null, 'Payment verified successfully');
  } catch (error) {
    next(error);
  }
});

export default router;
