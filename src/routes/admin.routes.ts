import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import db from '../config/database';
import { eq, and, or, inArray, gte, count, sum, avg, desc, sql, ilike } from 'drizzle-orm';
import { users, vendors, categories, services, bookings, payments, reviews, coupons, settings } from '../../db/schema/index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleGuard';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { sendAccountCreatedEmail } from '../services/email.service';

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
      db.select({ total: sum(bookings.commission) }).from(bookings).where(inArray(bookings.status, ['CONFIRMED', 'COMPLETED'])),
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
      db.select({
        month: sql<string>`TO_CHAR(${bookings.createdAt}, 'Mon')`,
        revenue: sum(bookings.commission),
        orders: count(),
      }).from(bookings).where(
        and(
          inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), 
          gte(bookings.createdAt, new Date(new Date().getFullYear(), 0, 1).toISOString())
        )
      ).groupBy(sql`TO_CHAR(${bookings.createdAt}, 'Mon')`),
    ]);

    const monthlyRevData: Record<string, number> = {};
    if (Array.isArray(monthlyRevenueResult)) {
      monthlyRevenueResult.forEach((row: any) => {
        if (row.month) {
          monthlyRevData[row.month.trim().toLowerCase()] = Number(row.revenue || 0);
        }
      });
    }

    ApiResponse.success(res, {
      stats: {
        totalRevenue: Number(totalRevenueResult[0]?.total || 0),
        monthlyRevenue: monthlyRevData,
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

// GET /api/admin/reports — Admin reports
router.get('/reports', authenticate, requireAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const twelveMonthsAgo = new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString();

    const [totalRevenueResult, totalOrdersResult, activeVendorsResult, totalCustomersResult, monthlyRevenue, topCategories, topVendors] = await Promise.all([
      db.select({ total: sum(bookings.commission) }).from(bookings).where(inArray(bookings.status, ['CONFIRMED', 'COMPLETED'])),
      db.select({ value: count() }).from(bookings),
      db.select({ value: count() }).from(vendors).where(eq(vendors.status, 'APPROVED')),
      db.select({ value: count() }).from(users).where(eq(users.role, 'CLIENT')),
      db.select({
        month: sql<string>`TO_CHAR(${bookings.createdAt}, 'YYYY-MM')`,
        revenue: sum(bookings.commission),
        orders: count(),
      }).from(bookings)
        .where(and(inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), gte(bookings.createdAt, twelveMonthsAgo)))
        .groupBy(sql`TO_CHAR(${bookings.createdAt}, 'YYYY-MM')`)
        .orderBy(sql`TO_CHAR(${bookings.createdAt}, 'YYYY-MM')`),
      db.select({
        name: categories.name,
        revenue: sum(bookings.commission),
        count: count(),
      }).from(bookings)
        .innerJoin(services, eq(bookings.serviceId, services.id))
        .innerJoin(categories, eq(services.categoryId, categories.id))
        .where(inArray(bookings.status, ['CONFIRMED', 'COMPLETED']))
        .groupBy(categories.id, categories.name)
        .orderBy(desc(sum(bookings.commission)))
        .limit(10),
      db.select({
        name: vendors.businessName,
        revenue: sum(bookings.commission),
        bookings: count(),
      }).from(bookings)
        .innerJoin(vendors, eq(bookings.vendorId, vendors.id))
        .where(inArray(bookings.status, ['CONFIRMED', 'COMPLETED']))
        .groupBy(vendors.id, vendors.businessName)
        .orderBy(desc(sum(bookings.commission)))
        .limit(10),
    ]);

    ApiResponse.success(res, {
      stats: {
        totalRevenue: Number(totalRevenueResult[0]?.total || 0),
        totalOrders: Number(totalOrdersResult[0]?.value || 0),
        activeVendors: Number(activeVendorsResult[0]?.value || 0),
        totalClients: Number(totalCustomersResult[0]?.value || 0),
      },
      monthlyRevenue: monthlyRevenue.map(m => ({
        month: m.month,
        revenue: Number(m.revenue || 0),
        orders: Number(m.orders || 0),
      })),
      topCategories: topCategories.map(c => ({
        name: c.name,
        revenue: Number(c.revenue || 0),
        bookings: Number(c.count || 0),
      })),
      topVendors: topVendors.map(v => ({
        name: v.name,
        revenue: Number(v.revenue || 0),
        bookings: Number(v.bookings || 0),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/users — List all users
router.get('/users', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { role } = req.query;
    
    let whereFilter = undefined;
    if (typeof role === 'string' && role !== 'All') {
      whereFilter = eq(users.role, role as any);
    }

    const usersList = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      city: users.city,
      isActive: users.isActive,
      createdAt: users.createdAt,
      vendorStatus: vendors.status,
    })
    .from(users)
    .leftJoin(vendors, eq(users.id, vendors.userId))
    .where(whereFilter)
    .orderBy(desc(users.createdAt));

    ApiResponse.success(res, usersList);
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

// PUT /api/admin/vendors/:id — Edit full vendor profile
router.put('/vendors/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { 
      businessName, gstNumber, panNumber, accountHolder, accountNumber, ifscCode, bankName,
      vendorName, email, phone, city
    } = req.body;

    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.id, id) });
    if (!vendor) throw ApiError.notFound('Vendor not found');

    if (vendorName || email || phone || city) {
      const userData: any = {};
      if (vendorName) userData.name = vendorName;
      if (email) userData.email = email;
      if (phone) userData.phone = phone;
      if (city) userData.city = city;
      await db.update(users).set(userData).where(eq(users.id, vendor.userId));
    }

    const vendorData: any = {};
    if (businessName) vendorData.businessName = businessName;
    if (gstNumber !== undefined) vendorData.gstNumber = gstNumber;
    if (panNumber !== undefined) vendorData.panNumber = panNumber;
    if (accountHolder !== undefined) vendorData.bankAccountName = accountHolder;
    if (accountNumber !== undefined) vendorData.bankAccountNo = accountNumber;
    if (ifscCode !== undefined) vendorData.bankIfsc = ifscCode;
    if (bankName !== undefined) vendorData.bankName = bankName;

    if (Object.keys(vendorData).length > 0) {
      await db.update(vendors).set(vendorData).where(eq(vendors.id, id));
    }

    ApiResponse.success(res, null, 'Vendor updated successfully');
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

// DELETE /api/admin/vendors/:id — Hard delete a vendor
router.delete('/vendors/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);

    // Business Logic: Prevent deletion if vendor has bookings
    const hasBookings = await db.query.bookings.findFirst({
      where: eq(bookings.vendorId, id)
    });

    if (hasBookings) {
      throw ApiError.badRequest('Cannot delete vendor because they have existing bookings. Please suspend them instead.');
    }

    await db.delete(vendors).where(eq(vendors.id, id));
    ApiResponse.success(res, null, 'Vendor deleted successfully');
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
    const { status, isFeatured, isTrending, isBestSeller, isNewArrival, title, categoryId, description, duration, basePrice, discountPrice, images } = req.body;

    const data: any = {};
    if (status !== undefined) data.status = status;
    if (isFeatured !== undefined) data.isFeatured = isFeatured;
    if (isTrending !== undefined) data.isTrending = isTrending;
    if (isBestSeller !== undefined) data.isBestSeller = isBestSeller;
    if (isNewArrival !== undefined) data.isNewArrival = isNewArrival;
    if (title !== undefined) data.title = title;
    if (categoryId !== undefined) data.categoryId = parseInt(categoryId);
    if (description !== undefined) data.description = description;
    if (duration !== undefined) data.serviceDuration = parseInt(duration);
    if (basePrice !== undefined) data.basePrice = parseFloat(basePrice);
    if (discountPrice !== undefined) data.discountPrice = parseFloat(discountPrice);
    if (images !== undefined) data.images = Array.isArray(images) ? JSON.stringify(images) : images;

    const [service] = await db.update(services).set(data).where(eq(services.id, id)).returning();
    if (!service) throw ApiError.notFound('Service not found');

    ApiResponse.success(res, service, 'Service updated');
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/services/:id — Hard delete a service
router.delete('/services/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);

    // Business Logic: Prevent deletion if service has bookings
    const hasBookings = await db.query.bookings.findFirst({
      where: eq(bookings.serviceId, id)
    });

    if (hasBookings) {
      throw ApiError.badRequest('Cannot delete service because it has existing bookings. Please reject or suspend it instead.');
    }

    await db.delete(services).where(eq(services.id, id));
    ApiResponse.success(res, null, 'Service deleted successfully');
  } catch (error) {
    next(error);
  }
});

// DELETE /api/admin/bookings/:id — Hard delete a booking
router.delete('/bookings/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);

    // Business Logic: Prevent deletion if booking has completed payments
    const hasPayments = await db.query.payments.findFirst({
      where: and(eq(payments.bookingId, id), eq(payments.status, 'COMPLETED'))
    });

    if (hasPayments) {
      throw ApiError.badRequest('Cannot delete booking because it has completed payments. Please cancel it and process refunds instead.');
    }

    // Since payments might exist as PENDING, we should delete them first or let cascade handle it (but schema has no cascade for payments).
    // So we manually delete associated payments, reviews, then the booking.
    await db.transaction(async (tx: any) => {
      await tx.delete(payments).where(eq(payments.bookingId, id));
      await tx.delete(reviews).where(eq(reviews.bookingId, id));
      await tx.delete(bookings).where(eq(bookings.id, id));
    });

    ApiResponse.success(res, null, 'Booking deleted successfully');
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/payments — All payments
router.get('/payments', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, search, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const filters = [];
    if (typeof status === 'string' && status !== 'All') {
      filters.push(eq(payments.status, status === 'SUCCESS' ? 'COMPLETED' : status as any));
    }

    const whereFilter = filters.length > 0 ? and(...filters) : undefined;

    const [paymentsList, totalResult] = await Promise.all([
      db.query.payments.findMany({
        where: whereFilter,
        with: {
          booking: {
            with: {
              client: { columns: { name: true } },
              vendor: { columns: { businessName: true } },
            }
          }
        },
        orderBy: [desc(payments.createdAt)],
        offset: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(payments).where(whereFilter),
    ]);

    let filtered = paymentsList;
    if (typeof search === 'string' && search) {
      const s = search.toLowerCase();
      filtered = paymentsList.filter((p: any) => 
        (p.razorpayPaymentId || '').toLowerCase().includes(s) ||
        (p.razorpayOrderId || '').toLowerCase().includes(s) ||
        (p.booking?.client?.name || '').toLowerCase().includes(s) ||
        (p.booking?.bookingNumber || '').toLowerCase().includes(s)
      );
    }

    const mapped = filtered.map((p: any) => ({
      id: p.id,
      paymentId: p.razorpayPaymentId || p.razorpayOrderId,
      bookingNumber: p.booking?.bookingNumber,
      customer: p.booking?.client?.name,
      vendor: p.booking?.vendor?.businessName,
      amount: Number(p.amount),
      commission: Number(p.booking?.commission || 0) * (Number(p.amount) / Number(p.booking?.totalAmount || 1)),
      vendorPayout: Number(p.amount) - (Number(p.booking?.commission || 0) * (Number(p.amount) / Number(p.booking?.totalAmount || 1))),
      method: "RAZORPAY",
      status: p.status === 'COMPLETED' ? 'SUCCESS' : p.status,
      createdAt: new Date(p.createdAt).toLocaleString(),
    }));

    ApiResponse.paginated(res, mapped, { page: pageNum, limit: limitNum, total: Number(totalResult[0]?.value || 0) });
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

    const searchVal = typeof req.query.search === 'string' ? req.query.search : undefined;
    if (searchVal) {
      const s = `%${searchVal}%`;
      filters.push(
        or(
          ilike(bookings.bookingNumber, s),
          ilike(bookings.status, s)
        )
      );
    }

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
    const { id: _, createdAt, updatedAt, ...updateData } = req.body;
    const [coupon] = await db.update(coupons).set(updateData).where(eq(coupons.id, id)).returning();
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

// POST /api/admin/users — Create a new user (EMPLOYEE or INVESTOR)
router.post('/users', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, email, role, phone, city } = req.body;

    if (!['EMPLOYEE', 'INVESTOR'].includes(role)) {
      throw ApiError.badRequest('Only EMPLOYEE and INVESTOR roles can be created');
    }

    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      throw ApiError.conflict('A user with this email already exists');
    }

    const tempPassword = crypto.randomBytes(4).toString('hex') + '@' + crypto.randomBytes(2).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const [user] = await db.insert(users).values({
      name,
      email,
      password: hashedPassword,
      phone: phone || null,
      role,
      city: city || null,
      isActive: true,
      emailVerified: true,
      mustChangePassword: true,
    }).returning();

    // Send credentials email (fire-and-forget)
    sendAccountCreatedEmail(user.email, user.name, tempPassword, role).catch((err: Error) => {
      console.warn('[Email] Failed to send account creation email:', err.message);
    });

    const { password: _, ...userData } = user;
    ApiResponse.created(res, { user: userData, tempPassword }, `${role} account created successfully`);
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

// PUT /api/admin/users/:id — Edit user details (EMPLOYEE or INVESTOR)
router.put('/users/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { name, email, phone, city, role } = req.body;

    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) throw ApiError.notFound('User not found');
    
    // Check if updating to a non-supported role, or modifying an Admin
    if (user.role === 'ADMIN' || (role && !['EMPLOYEE', 'INVESTOR'].includes(role))) {
       throw ApiError.badRequest('Can only edit Employee or Investor roles');
    }

    if (email && email !== user.email) {
      const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing) throw ApiError.conflict('A user with this email already exists');
    }

    const [updatedUser] = await db.update(users).set({
      name: name || user.name,
      email: email || user.email,
      phone: phone !== undefined ? phone : user.phone,
      city: city !== undefined ? city : user.city,
      role: role || user.role,
      updatedAt: new Date().toISOString()
    }).where(eq(users.id, id)).returning();

    const { password: _, ...userData } = updatedUser;
    ApiResponse.success(res, userData, 'User updated successfully');
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

// GET /api/admin/reviews — List all reviews for moderation
router.get('/reviews', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    let whereFilter = undefined;
    if (status === 'APPROVED') whereFilter = eq(reviews.isApproved, true);
    if (status === 'PENDING' || status === 'REJECTED') whereFilter = eq(reviews.isApproved, false);

    const [reviewsList, totalResult] = await Promise.all([
      db.query.reviews.findMany({
        where: whereFilter,
        with: {
          client: { columns: { name: true, email: true, avatar: true } },
          service: {
            columns: { title: true },
            with: { vendor: { columns: { businessName: true } } }
          },
        },
        orderBy: [desc(reviews.createdAt)],
        offset: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(reviews).where(whereFilter),
    ]);

    const mapped = reviewsList.map(r => ({
      ...r,
      status: r.isApproved ? 'APPROVED' : 'PENDING', // The DB just stores true/false for approval
    }));

    ApiResponse.paginated(res, mapped, { page: pageNum, limit: limitNum, total: Number(totalResult[0]?.value || 0) });
  } catch (error) {
    next(error);
  }
});

// PUT /api/admin/reviews/:id/status
router.put('/reviews/:id/status', authenticate, requireAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const { isApproved, adminReply } = req.body;

    const updateData: any = {};
    if (typeof isApproved === 'boolean') updateData.isApproved = isApproved;
    if (typeof adminReply === 'string') updateData.adminReply = adminReply;

    const [review] = await db.update(reviews).set(updateData).where(eq(reviews.id, id)).returning();
    if (!review) throw ApiError.notFound('Review not found');

    ApiResponse.success(res, review, `Review ${isApproved ? 'approved' : 'rejected'}`);
  } catch (error) {
    next(error);
  }
});

export default router;
