import { Router, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, and, inArray, gte, desc, asc, count, sum } from 'drizzle-orm';
import { users, vendors, services, categories, bookings, reviews, availabilitySlots } from '../../db/schema/index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireVendor } from '../middleware/roleGuard';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

const router = Router();

// GET /api/vendors/:id — Public vendor profile
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({
      where: eq(vendors.id, parseInt(req.params.id)),
      with: {
        user: { columns: { name: true, avatar: true, city: true } },
        services: {
          where: and(eq(services.status, 'APPROVED'), eq(services.isActive, true)),
          with: { category: { columns: { id: true, name: true, slug: true } } },
          orderBy: [desc(services.bookingCount)],
        },
      },
    });

    if (!vendor || vendor.status !== 'APPROVED') {
      throw ApiError.notFound('Vendor not found');
    }

    ApiResponse.success(res, vendor);
  } catch (error) {
    next(error);
  }
});

// GET /api/vendors/dashboard/stats — Vendor dashboard
router.get('/dashboard/stats', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const startOfMonth = new Date(new Date().setDate(1));

    const [totalBookingsResult, activeServicesResult, pendingBookingsResult, recentBookings, monthlyRevenueResult] = await Promise.all([
      db.select({ value: count() }).from(bookings).where(eq(bookings.vendorId, vendor.id)),
      db.select({ value: count() }).from(services).where(and(eq(services.vendorId, vendor.id), eq(services.status, 'APPROVED'), eq(services.isActive, true))),
      db.select({ value: count() }).from(bookings).where(and(eq(bookings.vendorId, vendor.id), eq(bookings.status, 'PENDING'))),
      db.query.bookings.findMany({
        where: eq(bookings.vendorId, vendor.id),
        with: {
          client: { columns: { name: true, phone: true } },
          service: { columns: { title: true } },
        },
        orderBy: [desc(bookings.createdAt)],
        limit: 10,
      }),
      db.select({ total: sum(bookings.totalAmount) }).from(bookings).where(
        and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), gte(bookings.createdAt, startOfMonth.toISOString()))
      ),
    ]);

    ApiResponse.success(res, {
      totalBookings: Number(totalBookingsResult[0]?.value || 0),
      activeServices: Number(activeServicesResult[0]?.value || 0),
      pendingBookings: Number(pendingBookingsResult[0]?.value || 0),
      totalEarnings: Number(vendor.totalEarnings),
      monthlyRevenue: Number(monthlyRevenueResult[0]?.total || 0),
      avgRating: Number(vendor.avgRating),
      reviewCount: vendor.reviewCount,
      recentBookings,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/vendors/profile — Update vendor profile
router.put('/profile', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const { businessName, description, logo, serviceCities, bankAccountName, bankAccountNo, bankIfsc, bankName } = req.body;

    await db.update(vendors).set({
      businessName,
      description,
      logo,
      serviceCities: serviceCities ? serviceCities : undefined,
      bankAccountName,
      bankAccountNo,
      bankIfsc,
      bankName,
    }).where(eq(vendors.id, vendor.id));

    const [updated] = await db.select().from(vendors).where(eq(vendors.id, vendor.id)).limit(1);

    ApiResponse.success(res, updated, 'Profile updated');
  } catch (error) {
    next(error);
  }
});

// GET /api/vendors/availability/slots — Get vendor availability
router.get('/availability/slots', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const slots = await db.select()
      .from(availabilitySlots)
      .where(eq(availabilitySlots.vendorId, vendor.id))
      .orderBy(asc(availabilitySlots.dayOfWeek), asc(availabilitySlots.startTime));

    ApiResponse.success(res, slots);
  } catch (error) {
    next(error);
  }
});

// POST /api/vendors/availability/slots — Set availability
router.post('/availability/slots', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const { slots } = req.body;

    // Delete existing and recreate
    await db.delete(availabilitySlots).where(eq(availabilitySlots.vendorId, vendor.id));

    if (slots?.length) {
      await db.insert(availabilitySlots).values(
        slots.map((s: any) => ({
          vendorId: vendor.id,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          maxBookings: s.maxBookings || 1,
          isActive: true,
        }))
      );
    }

    ApiResponse.success(res, null, 'Availability updated');
  } catch (error) {
    next(error);
  }
});

export default router;
