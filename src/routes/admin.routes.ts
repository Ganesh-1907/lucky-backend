import { Router, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, and, or, inArray, gte, count, sum, avg, desc, sql } from 'drizzle-orm';
import { users, vendors, categories, services, bookings, payments, reviews, coupons, settings } from '../../db/schema/index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleGuard';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

const router = Router();

// GET /api/admin/dashboard — Admin dashboard stats
router.get('/dashboard', authenticate, requireAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const startOfMonth = new Date(new Date().setDate(1));

    const [
      totalRevenueResult,
      totalOrdersResult,
      totalVendorsResult,
      totalClientsResult,
      pendingVendorsResult,
      pendingServicesResult,
      recentOrders,
      topServices,
      monthlyRevenueResult,
    ] = await Promise.all([
      db.select({ total: sum(bookings.totalAmount) }).from(bookings).where(inArray(bookings.status, ['CONFIRMED', 'COMPLETED'])),
      db.select({ value: count() }).from(bookings),
      db.select({ value: count() }).from(vendors).where(eq(vendors.status, 'APPROVED')),
      db.select({ value: count() }).from(users).where(eq(users.role, 'CLIENT')),
      db.select({ value: count() }).from(vendors).where(eq(vendors.status, 'PENDING')),
      db.select({ value: count() }).from(services).where(eq(services.status, 'PENDING')),
      db.query.bookings.findMany({
        with: {
          client: { columns: { name: true, email: true } },
          service: { columns: { title: true } },
          vendor: { columns: { businessName: true } },
        },
        orderBy: [desc(bookings.createdAt)],
        limit: 10,
      }),
      db.query.services.findMany({
        where: eq(services.status, 'APPROVED'),
        with: { vendor: { columns: { businessName: true } } },
        orderBy: [desc(services.bookingCount)],
        limit: 5,
      }),
      db.select({ total: sum(bookings.totalAmount) }).from(bookings).where(
        and(inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), gte(bookings.createdAt, startOfMonth.toISOString()))
      ),
    ]);

    ApiResponse.success(res, {
      stats: {
        totalRevenue: Number(totalRevenueResult[0]?.total || 0),
        monthlyRevenue: Number(monthlyRevenueResult[0]?.total || 0),
        totalOrders: Number(totalOrdersResult[0]?.value || 0),
        totalVendors: Number(totalVendorsResult[0]?.value || 0),
        totalClients: Number(totalClientsResult[0]?.value || 0),
        pendingVendors: Number(pendingVendorsResult[0]?.value || 0),
        pendingServices: Number(pendingServicesResult[0]?.value || 0),
      },
      recentOrders,
      topServices,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/vendors — List all vendors
router.get('/vendors', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const filters = [];
    const statusVal = typeof status === 'string' ? status : undefined;
    if (statusVal) filters.push(eq(vendors.status, statusVal as any));

    const whereFilter = filters.length > 0 ? and(...filters) : undefined;

    const [vendorsList, totalResult] = await Promise.all([
      db.query.vendors.findMany({
        where: whereFilter,
        with: {
          user: { columns: { name: true, email: true, phone: true, isActive: true } },
          services: { columns: { id: true } },
          bookings: { columns: { id: true } },
        },
        orderBy: [desc(vendors.createdAt)],
        offset: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(vendors).where(whereFilter),
    ]);

    const mapped = vendorsList.map(({ services: svcs, bookings: bks, ...vendor }) => ({
      ...vendor,
      _count: { services: svcs.length, bookings: bks.length },
    }));

    ApiResponse.paginated(res, mapped, { page: pageNum, limit: limitNum, total: Number(totalResult[0]?.value || 0) });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/vendors/:id/status — Approve/Reject/Suspend vendor
router.put('/vendors/:id/status', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (!['APPROVED', 'REJECTED', 'SUSPENDED', 'PENDING'].includes(status)) {
      throw ApiError.badRequest('Invalid status');
    }

    await db.update(vendors).set({ status }).where(eq(vendors.id, id));

    const vendor = await db.query.vendors.findFirst({
      where: eq(vendors.id, id),
      with: { user: { columns: { name: true, email: true } } },
    });

    if (!vendor) throw ApiError.notFound('Vendor not found');

    ApiResponse.success(res, vendor, `Vendor ${status.toLowerCase()}`);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/vendors/:id/commission — Set vendor commission
router.put('/vendors/:id/commission', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { commissionRate } = req.body;

    const [vendor] = await db.update(vendors).set({ commissionRate }).where(eq(vendors.id, id)).returning();
    if (!vendor) throw ApiError.notFound('Vendor not found');

    ApiResponse.success(res, vendor, 'Commission updated');
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/services — All services for moderation
router.get('/services', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const filters = [];
    const statusVal = typeof status === 'string' ? status : undefined;
    if (statusVal) filters.push(eq(services.status, statusVal as any));

    const whereFilter = filters.length > 0 ? and(...filters) : undefined;

    const [servicesList, totalResult] = await Promise.all([
      db.query.services.findMany({
        where: whereFilter,
        with: {
          category: { columns: { name: true } },
          vendor: { columns: { businessName: true } },
        },
        orderBy: [desc(services.createdAt)],
        offset: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(services).where(whereFilter),
    ]);

    ApiResponse.paginated(res, servicesList, { page: pageNum, limit: limitNum, total: Number(totalResult[0]?.value || 0) });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/services/:id/status — Approve/Reject service
router.put('/services/:id/status', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { status, isFeatured, isTrending, isBestSeller, isNewArrival } = req.body;

    const data: any = {};
    if (status) data.status = status;
    if (isFeatured !== undefined) data.isFeatured = isFeatured;
    if (isTrending !== undefined) data.isTrending = isTrending;
    if (isBestSeller !== undefined) data.isBestSeller = isBestSeller;
    if (isNewArrival !== undefined) data.isNewArrival = isNewArrival;

    const [service] = await db.update(services).set(data).where(eq(services.id, id)).returning();
    if (!service) throw ApiError.notFound('Service not found');

    ApiResponse.success(res, service, 'Service updated');
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/bookings — All bookings
router.get('/bookings', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const filters = [];
    const statusVal = typeof status === 'string' ? status : undefined;
    if (statusVal) filters.push(eq(bookings.status, statusVal as any));

    const whereFilter = filters.length > 0 ? and(...filters) : undefined;

    const [bookingsList, totalResult] = await Promise.all([
      db.query.bookings.findMany({
        where: whereFilter,
        with: {
          client: { columns: { name: true, email: true } },
          service: { columns: { title: true } },
          vendor: { columns: { businessName: true } },
          payments: true,
        },
        orderBy: [desc(bookings.createdAt)],
        offset: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(bookings).where(whereFilter),
    ]);

    ApiResponse.paginated(res, bookingsList, { page: pageNum, limit: limitNum, total: Number(totalResult[0]?.value || 0) });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/reviews — All reviews for moderation
router.get('/reviews', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { approved, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const filters = [];
    if (approved !== undefined) {
      filters.push(eq(reviews.isApproved, approved === 'true'));
    }

    const whereFilter = filters.length > 0 ? and(...filters) : undefined;

    const [reviewsList, totalResult] = await Promise.all([
      db.query.reviews.findMany({
        where: whereFilter,
        with: {
          client: { columns: { name: true } },
          service: { columns: { title: true } },
          vendor: { columns: { businessName: true } },
        },
        orderBy: [desc(reviews.createdAt)],
        offset: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(reviews).where(whereFilter),
    ]);

    ApiResponse.paginated(res, reviewsList, { page: pageNum, limit: limitNum, total: Number(totalResult[0]?.value || 0) });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/reviews/:id/approve
router.put('/reviews/:id/approve', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { isApproved } = req.body;

    const [review] = await db.update(reviews).set({ isApproved }).where(eq(reviews.id, id)).returning();
    if (!review) throw ApiError.notFound('Review not found');

    // Recalculate service & vendor ratings
    if (isApproved) {
      const [sr] = await db.select({
        avgRating: avg(reviews.rating),
        reviewCount: count(),
      }).from(reviews).where(and(eq(reviews.serviceId, review.serviceId), eq(reviews.isApproved, true)));

      await db.update(services).set({
        avgRating: String(sr?.avgRating || 0),
        reviewCount: Number(sr?.reviewCount || 0),
      }).where(eq(services.id, review.serviceId));

      const [vr] = await db.select({
        avgRating: avg(reviews.rating),
        reviewCount: count(),
      }).from(reviews).where(and(eq(reviews.vendorId, review.vendorId), eq(reviews.isApproved, true)));

      await db.update(vendors).set({
        avgRating: String(vr?.avgRating || 0),
        reviewCount: Number(vr?.reviewCount || 0),
      }).where(eq(vendors.id, review.vendorId));
    }

    ApiResponse.success(res, review, `Review ${isApproved ? 'approved' : 'rejected'}`);
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/coupons — List coupons
router.get('/coupons', authenticate, requireAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const couponsList = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
    ApiResponse.success(res, couponsList);
  } catch (error) {
    next(error);
  }
});

// POST /api/admin/coupons — Create coupon
router.post('/coupons', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [coupon] = await db.insert(coupons).values(req.body).returning();
    ApiResponse.created(res, coupon);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/coupons/:id
router.put('/coupons/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const [coupon] = await db.update(coupons).set(req.body).where(eq(coupons.id, id)).returning();
    if (!coupon) throw ApiError.notFound('Coupon not found');
    ApiResponse.success(res, coupon, 'Coupon updated');
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/coupons/:id
router.delete('/coupons/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(coupons).where(eq(coupons.id, id));
    ApiResponse.success(res, null, 'Coupon deleted');
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/users/:id/toggle — Activate/Deactivate user
router.put('/users/:id/toggle', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw ApiError.notFound('User not found');

    await db.update(users).set({ isActive: !user.isActive }).where(eq(users.id, id));

    const [updated] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const { password: _, ...userData } = updated!;

    ApiResponse.success(res, userData, `User ${updated!.isActive ? 'activated' : 'deactivated'}`);
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/settings
router.get('/settings', authenticate, requireAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const allSettings = await db.select().from(settings);
    const settingsMap = allSettings.reduce((acc: any, s: any) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
    ApiResponse.success(res, settingsMap);
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/settings
router.put('/settings', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const settingsData = req.body;

    for (const [key, value] of Object.entries(settingsData)) {
      await db.insert(settings).values({ key, value: String(value) })
        .onConflictDoUpdate({ target: settings.key, set: { value: String(value) } });
    }

    ApiResponse.success(res, null, 'Settings updated');
  } catch (error) {
    next(error);
  }
});

export default router;
