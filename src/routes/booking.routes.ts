import { Router, Response, NextFunction } from 'express';
import db from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { generateBookingNumber } from '../utils/helpers';
import { eq, and, or, like, ilike, desc, asc, count, sum, sql, inArray, gte, lte, lt, ne, isNull } from 'drizzle-orm';
import { users, vendors, categories, services, addons, serviceFaqs, bookings, reviews, menuItems, banners, coupons, wishlists, homepageSections, notifications, recentlyViewed, cities, settings, payments, employeeBookingAssignments, bookingNotes, bookingTimeline, followUps, employeeTasks, availabilitySlots, seoPages } from '../../db/schema/index';

const router = Router();

// POST /api/bookings — Create booking
router.post('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      serviceId, bookingDate, timeSlot, selectedAddons,
      couponCode, city, address, pincode, notes,
    } = req.body;

    const service = await db.query.services.findFirst({
      where: eq(services.id, serviceId),
      with: { addons: true, vendor: true },
    });

    if (!service || service.status !== 'APPROVED' || !service.isActive) {
      throw ApiError.notFound('Service not available');
    }

    // Calculate pricing
    let baseAmount = Number(service.discountPrice || service.basePrice);
    let addonsAmount = 0;
    const selectedAddonDetails: any[] = [];

    if (selectedAddons?.length) {
      for (const addonId of selectedAddons) {
        const addon = service.addons.find((a: any) => a.id === addonId);
        if (addon) {
          addonsAmount += Number(addon.price);
          selectedAddonDetails.push({
            id: addon.id,
            name: addon.name,
            price: Number(addon.price),
          });
        }
      }
    }

    // Apply coupon
    let couponDiscount = 0;
    if (couponCode) {
      const [coupon] = await db.select().from(coupons).where(eq(coupons.code, couponCode)).limit(1);
      if (coupon && coupon.isActive && new Date() >= new Date(coupon.validFrom) && new Date() <= new Date(coupon.validTo)) {
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
          throw ApiError.badRequest('Coupon usage limit reached');
        }
        const subtotal = baseAmount + addonsAmount;
        if (subtotal >= Number(coupon.minOrder)) {
          if (coupon.type === 'PERCENTAGE') {
            couponDiscount = (subtotal * Number(coupon.value)) / 100;
            if (coupon.maxDiscount) {
              couponDiscount = Math.min(couponDiscount, Number(coupon.maxDiscount));
            }
          } else {
            couponDiscount = Number(coupon.value);
          }
        }
        await db.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, coupon.id));
      }
    }

    const totalAmount = baseAmount + addonsAmount - couponDiscount;
    const advanceRequired = (totalAmount * service.minAdvancePercent) / 100;
    const commission = (totalAmount * Number(service.vendor.commissionRate)) / 100;

    // Check booking overlap
    const [existingBooking] = await db.select().from(bookings).where(
      and(
        eq(bookings.vendorId, service.vendorId),
        eq(bookings.bookingDate, new Date(bookingDate).toISOString()),
        eq(bookings.timeSlot, timeSlot as string),
        inArray(bookings.status, ['PENDING', 'CONFIRMED', 'IN_PROGRESS']),
      )
    ).limit(1);

    if (existingBooking) {
      throw ApiError.conflict('This time slot is already booked');
    }

    const [booking] = await db.insert(bookings).values({
      bookingNumber: generateBookingNumber(),
      clientId: req.user!.id,
      serviceId,
      vendorId: service.vendorId,
      bookingDate: new Date(bookingDate).toISOString(),
      timeSlot,
      baseAmount: String(baseAmount),
      addonsAmount: String(addonsAmount),
      couponDiscount: String(couponDiscount),
      totalAmount: String(totalAmount),
      advancePaid: '0',
      remainingAmount: String(totalAmount),
      commission: String(commission),
      selectedAddons: selectedAddonDetails as any,
      couponCode,
      city,
      address,
      pincode,
      notes,
      status: 'PENDING',
    }).returning();

    const createdBooking = await db.query.bookings.findFirst({
      where: eq(bookings.id, booking.id),
      with: {
        service: { columns: { title: true, images: true } },
        vendor: { columns: { businessName: true } },
      },
    });

    ApiResponse.created(res, {
      booking: createdBooking,
      advanceRequired,
    }, 'Booking created. Please complete advance payment.');
  } catch (error) {
    next(error);
  }
});

// GET /api/bookings — User's bookings
router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const conditions = [eq(bookings.clientId, req.user!.id)];
    if (status) conditions.push(eq(bookings.status, status as any));

    const [bookingsData, totalRows] = await Promise.all([
      db.query.bookings.findMany({
        where: and(...conditions),
        with: {
          service: { columns: { title: true, images: true, slug: true } },
          vendor: { columns: { businessName: true } },
          payments: true,
          review: true,
        },
        orderBy: [desc(bookings.createdAt)],
        offset: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(bookings).where(and(...conditions)),
    ]);

    const total = Number(totalRows[0].value);

    ApiResponse.paginated(res, bookingsData, { page: pageNum, limit: limitNum, total });
  } catch (error) {
    next(error);
  }
});

// GET /api/bookings/:idOrNumber
router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const param = req.params.id;
    const isNumeric = /^\d+$/.test(param);
    
    const booking = await db.query.bookings.findFirst({
      where: isNumeric 
        ? eq(bookings.id, parseInt(param))
        : eq(bookings.bookingNumber, param),
      with: {
        service: { with: { category: true } },
        vendor: { with: { user: { columns: { name: true, phone: true } } } },
        client: { columns: { name: true, email: true, phone: true } },
        payments: { orderBy: [desc(payments.createdAt)] },
        review: true,
      },
    });

    if (!booking) throw ApiError.notFound('Booking not found');

    // Check access
    if (req.user!.role === 'CLIENT' && booking.clientId !== req.user!.id) {
      throw ApiError.forbidden();
    }

    ApiResponse.success(res, booking);
  } catch (error) {
    next(error);
  }
});

// PUT /api/bookings/:id/status — Update booking status (Vendor/Admin)
router.put('/:id/status', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { status, cancelReason } = req.body;

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, id),
      with: { vendor: true },
    });

    if (!booking) throw ApiError.notFound('Booking not found');

    // Verify vendor ownership or admin
    if (req.user!.role === 'VENDOR') {
      const [vendor] = await db.select().from(vendors).where(eq(vendors.userId, req.user!.id)).limit(1);
      if (!vendor || vendor.id !== booking.vendorId) {
        throw ApiError.forbidden();
      }
    } else if (req.user!.role !== 'ADMIN') {
      throw ApiError.forbidden();
    }

    const data: any = { status };
    if (status === 'CANCELLED') {
      data.cancelReason = cancelReason;
      data.cancelledAt = new Date().toISOString();
    }
    if (status === 'COMPLETED') {
      data.completedAt = new Date().toISOString();
      // Update vendor stats
      await db.update(vendors).set({
        totalEarnings: sql`${vendors.totalEarnings} + ${Number(booking.totalAmount) - Number(booking.commission)}`,
        totalBookings: sql`${vendors.totalBookings} + 1`,
      }).where(eq(vendors.id, booking.vendorId));
      // Update service stats
      await db.update(services).set({
        bookingCount: sql`${services.bookingCount} + 1`,
      }).where(eq(services.id, booking.serviceId));
    }

    const [updated] = await db.update(bookings).set(data).where(eq(bookings.id, id)).returning();

    ApiResponse.success(res, updated, `Booking ${status.toLowerCase()}`);
  } catch (error) {
    next(error);
  }
});

// POST /api/bookings/:id/cancel — Client cancel
router.post('/:id/cancel', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { reason } = req.body;

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!booking || booking.clientId !== req.user!.id) {
      throw ApiError.notFound('Booking not found');
    }

    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      throw ApiError.badRequest('Cannot cancel this booking');
    }

    const [updated] = await db.update(bookings).set({
      status: 'CANCELLED',
      cancelReason: reason || 'Cancelled by customer',
      cancelledAt: new Date().toISOString(),
    }).where(eq(bookings.id, id)).returning();

    ApiResponse.success(res, updated, 'Booking cancelled');
  } catch (error) {
    next(error);
  }
});

// GET /api/bookings/vendor/list — Vendor's bookings
router.get('/vendor/list', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [vendor] = await db.select().from(vendors).where(eq(vendors.userId, req.user!.id)).limit(1);
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const { status, page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const conditions = [eq(bookings.vendorId, vendor.id)];
    if (status) conditions.push(eq(bookings.status, status as any));

    const searchVal = typeof req.query.search === 'string' ? req.query.search : undefined;
    if (searchVal) {
      const s = `%${searchVal}%`;
      conditions.push(
        or(
          ilike(bookings.bookingNumber, s),
          ilike(bookings.status, s)
        )
      );
    }

    const [bookingsData, totalRows] = await Promise.all([
      db.query.bookings.findMany({
        where: and(...conditions),
        with: {
          client: { columns: { name: true, email: true, phone: true } },
          service: { columns: { title: true, images: true } },
          payments: true,
        },
        orderBy: [desc(bookings.createdAt)],
        offset: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(bookings).where(and(...conditions)),
    ]);

    const total = Number(totalRows[0].value);

    ApiResponse.paginated(res, bookingsData, { page: pageNum, limit: limitNum, total });
  } catch (error) {
    next(error);
  }
});

export default router;
