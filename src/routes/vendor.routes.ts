import { Router, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, and, inArray, gte, lte, desc, asc, count, sum, avg, sql } from 'drizzle-orm';
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

// GET /api/vendors/earnings — Vendor earnings & payouts
router.get('/earnings', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const [monthlyEarnings, recentTransactionsResult, pendingPayoutsResult] = await Promise.all([
      db.select({
        month: sql<string>`TO_CHAR(${bookings.createdAt}, 'YYYY-MM')`,
        revenue: sum(bookings.totalAmount),
        count: count(),
      }).from(bookings)
        .where(and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'COMPLETED'])))
        .groupBy(sql`TO_CHAR(${bookings.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${bookings.createdAt}, 'YYYY-MM')`),
      db.query.bookings.findMany({
        where: eq(bookings.vendorId, vendor.id),
        with: { client: { columns: { name: true } }, service: { columns: { title: true } } },
        orderBy: [desc(bookings.createdAt)],
        limit: 20,
      }),
      db.select({ total: sum(bookings.totalAmount) }).from(bookings)
        .where(and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'COMPLETED']))),
    ]);

    ApiResponse.success(res, {
      totalEarnings: Number(vendor.totalEarnings),
      pendingPayouts: Number(pendingPayoutsResult[0]?.total || 0),
      monthlyEarnings: monthlyEarnings.map(m => ({
        month: m.month,
        revenue: Number(m.revenue || 0),
        bookings: Number(m.count || 0),
      })),
      recentTransactions: recentTransactionsResult,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/vendors/analytics — Vendor analytics
router.get('/analytics', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const [revenueResult, bookingsResult, ratingResult, viewsResult, topServices, cityBreakdown] = await Promise.all([
      db.select({ total: sum(bookings.totalAmount) }).from(bookings)
        .where(and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'COMPLETED']))),
      db.select({ value: count() }).from(bookings).where(eq(bookings.vendorId, vendor.id)),
      db.select({ avg: avg(reviews.rating) }).from(reviews).where(eq(reviews.vendorId, vendor.id)),
      db.select({ total: sum(services.viewCount) }).from(services).where(eq(services.vendorId, vendor.id)),
      db.query.services.findMany({
        where: eq(services.vendorId, vendor.id),
        columns: { id: true, title: true, bookingCount: true, viewCount: true, basePrice: true, avgRating: true },
        orderBy: [desc(services.bookingCount)],
        limit: 5,
      }),
      db.select({
        city: bookings.city,
        count: count(),
        revenue: sum(bookings.totalAmount),
      }).from(bookings)
        .where(and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'COMPLETED'])))
        .groupBy(bookings.city)
        .orderBy(desc(count())),
    ]);

    ApiResponse.success(res, {
      metrics: {
        totalRevenue: Number(revenueResult[0]?.total || 0),
        totalBookings: Number(bookingsResult[0]?.value || 0),
        avgRating: Number(ratingResult[0]?.avg || 0),
        totalViews: Number(viewsResult[0]?.total || 0),
      },
      topServices,
      cityBreakdown: cityBreakdown.map(c => ({
        city: c.city,
        bookings: Number(c.count || 0),
        revenue: Number(c.revenue || 0),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/vendors/calendar — Vendor calendar
router.get('/calendar', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const month = parseInt(req.query.month as string) || (new Date().getMonth() + 1);

    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    const calendarBookings = await db.query.bookings.findMany({
      where: and(
        eq(bookings.vendorId, vendor.id),
        gte(bookings.bookingDate, startDate),
        lte(bookings.bookingDate, endDate)
      ),
      with: {
        client: { columns: { name: true, phone: true } },
        service: { columns: { title: true } },
      },
      orderBy: [asc(bookings.bookingDate)],
    });

    const grouped = calendarBookings.reduce((acc: Record<string, typeof calendarBookings>, booking) => {
      const date = booking.bookingDate.split('T')[0];
      if (!acc[date]) acc[date] = [];
      acc[date].push(booking);
      return acc;
    }, {});

    ApiResponse.success(res, {
      year,
      month,
      bookings: grouped,
      totalBookings: calendarBookings.length,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/vendors/reviews — Vendor reviews
router.get('/reviews', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const [stats, reviewsList] = await Promise.all([
      db.select({
        avgRating: avg(reviews.rating),
        totalReviews: count(),
        rating1: sql<number>`COALESCE(SUM(CASE WHEN ${reviews.rating} = 1 THEN 1 ELSE 0 END), 0)`,
        rating2: sql<number>`COALESCE(SUM(CASE WHEN ${reviews.rating} = 2 THEN 1 ELSE 0 END), 0)`,
        rating3: sql<number>`COALESCE(SUM(CASE WHEN ${reviews.rating} = 3 THEN 1 ELSE 0 END), 0)`,
        rating4: sql<number>`COALESCE(SUM(CASE WHEN ${reviews.rating} = 4 THEN 1 ELSE 0 END), 0)`,
        rating5: sql<number>`COALESCE(SUM(CASE WHEN ${reviews.rating} = 5 THEN 1 ELSE 0 END), 0)`,
      }).from(reviews).where(eq(reviews.vendorId, vendor.id)),
      db.query.reviews.findMany({
        where: eq(reviews.vendorId, vendor.id),
        with: {
          client: { columns: { name: true, avatar: true } },
          service: { columns: { title: true } },
        },
        orderBy: [desc(reviews.createdAt)],
      }),
    ]);

    ApiResponse.success(res, {
      stats: {
        avgRating: Number(stats[0]?.avgRating || 0),
        totalReviews: Number(stats[0]?.totalReviews || 0),
        breakdown: {
          1: Number(stats[0]?.rating1 || 0),
          2: Number(stats[0]?.rating2 || 0),
          3: Number(stats[0]?.rating3 || 0),
          4: Number(stats[0]?.rating4 || 0),
          5: Number(stats[0]?.rating5 || 0),
        },
      },
      reviews: reviewsList,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
