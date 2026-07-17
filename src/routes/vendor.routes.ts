import { Router, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, and, inArray, gte, lte, lt, desc, asc, count, sum, avg, sql } from 'drizzle-orm';
import { users, vendors, services, categories, bookings, reviews, availabilitySlots, notifications } from '../../db/schema/index';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireVendor } from '../middleware/roleGuard';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';

const router = Router();

// GET /api/vendors/dashboard/stats — Vendor dashboard
router.get('/dashboard/stats', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const startOfMonth = new Date(new Date().setDate(1)).toISOString();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();
    
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekStr = lastWeek.toISOString();

    const [
      totalBookingsResult, activeServicesResult, pendingBookingsResult, recentBookings, 
      monthlyRevenueResult, viewsResult, todayBookingsResult, weeklyRevenueResult, 
      cancelledBookingsResult, completedBookingsResult, upcomingBookingsResult,
      bookingStatusDistributionResult, catRevenueResult, clientCounts
    ] = await Promise.all([
      db.select({ value: count() }).from(bookings).where(eq(bookings.vendorId, vendor.id)),
      db.select({ value: count() }).from(services).where(eq(services.vendorId, vendor.id)),
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
        and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), gte(bookings.createdAt, startOfMonth))
      ),
      db.select({ total: sum(services.viewCount) }).from(services).where(eq(services.vendorId, vendor.id)),
      db.select({ value: count() }).from(bookings).where(and(eq(bookings.vendorId, vendor.id), gte(bookings.createdAt, todayStr))),
      db.select({ total: sum(bookings.totalAmount) }).from(bookings).where(
        and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), gte(bookings.createdAt, lastWeekStr))
      ),
      db.select({ value: count() }).from(bookings).where(and(eq(bookings.vendorId, vendor.id), eq(bookings.status, 'CANCELLED'))),
      db.select({ value: count() }).from(bookings).where(and(eq(bookings.vendorId, vendor.id), eq(bookings.status, 'COMPLETED'))),
      db.select({ value: count() }).from(bookings).where(and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'IN_PROGRESS']), gte(bookings.bookingDate, todayStr))),
      db.select({ status: bookings.status, count: count() }).from(bookings).where(eq(bookings.vendorId, vendor.id)).groupBy(bookings.status),
      db.select({ category: categories.name, revenue: sum(bookings.totalAmount) })
        .from(bookings)
        .innerJoin(services, eq(bookings.serviceId, services.id))
        .innerJoin(categories, eq(services.categoryId, categories.id))
        .where(and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'COMPLETED'])))
        .groupBy(categories.name),
      db.select({ clientId: bookings.clientId, count: count() }).from(bookings).where(eq(bookings.vendorId, vendor.id)).groupBy(bookings.clientId)
    ]);

    const repeatCustomers = clientCounts.filter(c => c.count > 1).length;

    ApiResponse.success(res, {
      totalBookings: Number(totalBookingsResult[0]?.value || 0),
      activeServices: Number(activeServicesResult[0]?.value || 0),
      pendingBookings: Number(pendingBookingsResult[0]?.value || 0),
      totalEarnings: Number(vendor.totalEarnings),
      monthlyRevenue: Number(monthlyRevenueResult[0]?.total || 0),
      avgRating: Number(vendor.avgRating),
      reviewCount: vendor.reviewCount,
      totalViews: Number(viewsResult[0]?.total || 0),
      todayBookings: Number(todayBookingsResult[0]?.value || 0),
      weeklyRevenue: Number(weeklyRevenueResult[0]?.total || 0),
      cancelledBookings: Number(cancelledBookingsResult[0]?.value || 0),
      completedBookings: Number(completedBookingsResult[0]?.value || 0),
      upcomingBookings: Number(upcomingBookingsResult[0]?.value || 0),
      repeatCustomers,
      bookingStatusDistribution: bookingStatusDistributionResult.map(s => ({ name: s.status, value: Number(s.count || 0) })),
      revenueByCategory: catRevenueResult.map(c => ({ name: c.category, value: Number(c.revenue || 0) })),
      recentBookings,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/vendors/profile — Get vendor profile
router.get('/profile', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, req.user!.id) });
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor || !user) throw ApiError.notFound('Vendor not found');

    const responseData = {
      businessName: vendor.businessName || "",
      description: vendor.description || "",
      logo: vendor.logo || "",
      phone: user.phone || "",
      email: user.email || "",
      address: user.address || "",
      city: user.city || "",
      gstNumber: vendor.gstNumber || "",
      panNumber: vendor.panNumber || "",
      bankName: vendor.bankName || "",
      bankAccountName: vendor.bankAccountName || "",
      accountNumber: vendor.bankAccountNo || "",
      ifscCode: vendor.bankIfsc || "",
      serviceCities: vendor.serviceCities || [],
      preferences: vendor.preferences || {
        autoAccept: false,
        instantBooking: true,
        emailNotifications: true,
        smsNotifications: false
      }
    };

    ApiResponse.success(res, responseData);
  } catch (error) {
    next(error);
  }
});

// PUT /api/vendors/profile — Update vendor profile
router.put('/profile', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const { 
      businessName, description, logo, phone, address, city,
      gstNumber, panNumber, bankName, bankAccountName, accountNumber, ifscCode,
      serviceCities, preferences
    } = req.body;

    // Update User fields
    await db.update(users).set({
      phone: phone || null,
      address: address || null,
      city: city || null,
    }).where(eq(users.id, req.user!.id));

    // Update Vendor fields
    await db.update(vendors).set({
      businessName,
      description,
      logo,
      gstNumber,
      panNumber,
      serviceCities: serviceCities ? serviceCities : undefined,
      bankAccountName,
      bankAccountNo: accountNumber,
      bankIfsc: ifscCode,
      bankName,
      preferences: preferences || vendor.preferences,
    }).where(eq(vendors.id, vendor.id));

    ApiResponse.success(res, {}, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
});

// PUT /api/vendors/password — Change Password
import bcrypt from 'bcryptjs';

router.put('/password', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      throw ApiError.badRequest('Current and new password are required');
    }

    const user = await db.query.users.findFirst({ where: eq(users.id, req.user!.id) });
    if (!user || !user.password) throw ApiError.badRequest('User not found or no password set');

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) throw ApiError.unauthorized('Incorrect current password');

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ password: hashed }).where(eq(users.id, user.id));

    ApiResponse.success(res, {}, 'Password updated successfully');
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

// GET /api/vendors/calendar — Vendor calendar bookings
router.get('/calendar', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor) throw ApiError.notFound('Vendor not found');

    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    // Generate exact strings for PostgreSQL timestamp without timezone to avoid parsing inconsistencies
    const startDate = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay} 23:59:59`;

    const vendorBookings = await db.query.bookings.findMany({
      where: and(
        eq(bookings.vendorId, vendor.id),
        gte(bookings.bookingDate, startDate),
        lt(bookings.bookingDate, endDate)
      ),
      with: {
        client: { columns: { name: true } },
        service: { columns: { title: true } },
        address: true,
      },
      orderBy: [asc(bookings.bookingTime)]
    });

    // Group by date (YYYY-MM-DD)
    const bookingsByDate: Record<string, any[]> = {};
    for (const b of vendorBookings) {
      // Create date at noon UTC to avoid timezone shifts when grabbing ISO string, or use local
      const d = new Date(b.bookingDate);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      
      if (!bookingsByDate[dateStr]) bookingsByDate[dateStr] = [];
      
      bookingsByDate[dateStr].push({
        id: b.id,
        bookingNumber: b.bookingNumber,
        time: b.bookingTime || "TBD",
        customer: b.client?.name || "Guest",
        service: b.service?.title || "Unknown Service",
        status: b.status,
        paymentStatus: b.paymentStatus,
        city: b.address?.city || "Unknown Location",
      });
    }

    ApiResponse.success(res, bookingsByDate);
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
    console.log("Analytics - vendor.id:", vendor.id, "req.query.range:", req.query.range);

    const range = (req.query.range as string) || '30d';
    const now = new Date();
    let startDate = new Date();
    
    if (range === 'today') startDate.setHours(0, 0, 0, 0);
    else if (range === '7d') startDate.setDate(now.getDate() - 7);
    else if (range === '30d') startDate.setDate(now.getDate() - 30);
    else if (range === '90d') startDate.setDate(now.getDate() - 90);
    else if (range === '1y') startDate.setFullYear(now.getFullYear() - 1);
    else startDate.setDate(now.getDate() - 30);

    const startDateStr = startDate.toISOString();
    
    // For growth calculation
    const periodDuration = now.getTime() - startDate.getTime();
    const previousStartDateStr = new Date(startDate.getTime() - periodDuration).toISOString();

    const [
      revenueResult, prevRevenueResult,
      bookingsResult, prevBookingsResult,
      ratingResult, 
      statusDistribution,
      topServices,
      trendResult,
      clientCounts,
      upcomingRevenueResult,
      activeServicesResult
    ] = await Promise.all([
      db.select({ total: sum(bookings.totalAmount) }).from(bookings).where(and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), gte(bookings.createdAt, startDateStr))),
      db.select({ total: sum(bookings.totalAmount) }).from(bookings).where(and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), gte(bookings.createdAt, previousStartDateStr), sql`${bookings.createdAt} < ${startDateStr}`)),
      
      db.select({ value: count() }).from(bookings).where(and(eq(bookings.vendorId, vendor.id), gte(bookings.createdAt, startDateStr))),
      db.select({ value: count() }).from(bookings).where(and(eq(bookings.vendorId, vendor.id), gte(bookings.createdAt, previousStartDateStr), sql`${bookings.createdAt} < ${startDateStr}`)),
      
      db.select({ avg: avg(reviews.rating) }).from(reviews).where(and(eq(reviews.vendorId, vendor.id), gte(reviews.createdAt, startDateStr))),
      
      db.select({ status: bookings.status, count: count() }).from(bookings).where(and(eq(bookings.vendorId, vendor.id), gte(bookings.createdAt, startDateStr))).groupBy(bookings.status),
      
      db.select({ id: services.id, title: services.title, count: count(), revenue: sum(bookings.totalAmount) })
        .from(bookings).innerJoin(services, eq(bookings.serviceId, services.id))
        .where(and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), gte(bookings.createdAt, startDateStr)))
        .groupBy(services.id, services.title)
        .orderBy(desc(sum(bookings.totalAmount)))
        .limit(5),

      db.select({
        date: sql<string>`TO_CHAR(${bookings.createdAt}, 'YYYY-MM-DD')`,
        bookings: count(),
        revenue: sum(bookings.totalAmount)
      }).from(bookings)
        .where(and(eq(bookings.vendorId, vendor.id), gte(bookings.createdAt, startDateStr)))
        .groupBy(sql`TO_CHAR(${bookings.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${bookings.createdAt}, 'YYYY-MM-DD')`),

      db.select({ clientId: bookings.clientId, count: count() }).from(bookings).where(and(eq(bookings.vendorId, vendor.id), gte(bookings.createdAt, startDateStr))).groupBy(bookings.clientId),
      
      db.select({ total: sum(bookings.totalAmount) }).from(bookings).where(and(eq(bookings.vendorId, vendor.id), inArray(bookings.status, ['CONFIRMED', 'IN_PROGRESS']), gte(bookings.bookingDate, now.toISOString()))),
      
      db.select({ value: count() }).from(services).where(eq(services.vendorId, vendor.id))
    ]);

    const totalRevenue = Number(revenueResult[0]?.total || 0);
    const prevRevenue = Number(prevRevenueResult[0]?.total || 0);
    const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : (totalRevenue > 0 ? 100 : 0);

    const totalBookings = Number(bookingsResult[0]?.value || 0);
    const prevBookings = Number(prevBookingsResult[0]?.value || 0);
    const bookingsGrowth = prevBookings > 0 ? ((totalBookings - prevBookings) / prevBookings) * 100 : (totalBookings > 0 ? 100 : 0);

    const completed = statusDistribution.find(s => s.status === 'COMPLETED')?.count || 0;
    const cancelled = statusDistribution.find(s => s.status === 'CANCELLED')?.count || 0;
    const accepted = statusDistribution.filter(s => ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(s.status)).reduce((a, b) => a + Number(b.count), 0);
    
    const completionRate = totalBookings > 0 ? (Number(completed) / totalBookings) * 100 : 0;
    const cancellationRate = totalBookings > 0 ? (Number(cancelled) / totalBookings) * 100 : 0;
    const acceptanceRate = totalBookings > 0 ? (Number(accepted) / totalBookings) * 100 : 0;

    const repeatCustomers = clientCounts.filter(c => c.count > 1).length;
    const averageOrderValue = totalBookings > 0 ? totalRevenue / totalBookings : 0;

    // Build trend chart data
    const days = range === 'today' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;
    const trendMap = new Map((trendResult as any[]).map(r => [r.date, { bookings: Number(r.bookings), revenue: Number(r.revenue || 0) }]));
    
    let chartData = [];
    if (days <= 90) {
      chartData = Array.from({ length: days }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (days - 1 - i));
        const dateStr = d.toISOString().split('T')[0];
        const data = trendMap.get(dateStr) || { bookings: 0, revenue: 0 };
        return {
          date: dateStr,
          day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          revenue: data.revenue,
          bookings: data.bookings
        };
      });
    } else {
      // Group by month for 1y
      const monthMap = new Map();
      for (const [dateStr, data] of trendMap.entries()) {
        const month = dateStr.substring(0, 7); // YYYY-MM
        const existing = monthMap.get(month) || { bookings: 0, revenue: 0 };
        monthMap.set(month, { bookings: existing.bookings + data.bookings, revenue: existing.revenue + data.revenue });
      }
      chartData = Array.from(monthMap.entries()).map(([month, data]) => {
        const d = new Date(month + '-01');
        return {
          date: month,
          day: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          revenue: data.revenue,
          bookings: data.bookings
        };
      }).sort((a, b) => a.date.localeCompare(b.date));
    }

    ApiResponse.success(res, {
      metrics: {
        totalRevenue,
        revenueGrowth,
        totalBookings,
        bookingsGrowth,
        avgRating: Number(ratingResult[0]?.avg || 0),
        activeServices: Number(activeServicesResult[0]?.value || 0),
        upcomingRevenue: Number(upcomingRevenueResult[0]?.total || 0),
        averageOrderValue,
        completionRate,
        cancellationRate,
        acceptanceRate,
        repeatCustomers,
        totalCustomers: clientCounts.length
      },
      statusDistribution: statusDistribution.map(s => ({ name: s.status, value: Number(s.count) })),
      topServices: topServices.map(s => ({ ...s, revenue: Number(s.revenue), count: Number(s.count) })),
      chartData,
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

// GET /api/vendors/notifications — Vendor notifications
router.get('/notifications', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    console.log("Notifications - req.user.id:", req.user?.id);
    const unreadCountResult = await db.select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, req.user!.id), eq(notifications.isRead, false)));

    const notificationsList = await db.query.notifications.findMany({
      where: eq(notifications.userId, req.user!.id),
      orderBy: [desc(notifications.createdAt)],
      limit: 20,
    });

    ApiResponse.success(res, {
      unreadCount: Number(unreadCountResult[0]?.value || 0),
      notifications: notificationsList,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/vendors/notifications/:id/read — Mark notification as read
router.put('/notifications/:id/read', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    
    if (id === 'all') {
      await db.update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.userId, req.user!.id));
    } else {
      await db.update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, parseInt(id)), eq(notifications.userId, req.user!.id)));
    }

    ApiResponse.success(res, null, 'Notification(s) marked as read');
  } catch (error) {
    next(error);
  }
});

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

export default router;
