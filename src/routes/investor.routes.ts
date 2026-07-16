import { Router, Response, NextFunction } from 'express';
import db from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireInvestor } from '../middleware/roleGuard';
import { ApiResponse } from '../utils/apiResponse';
import { eq, and, or, like, ilike, desc, asc, count, sum, sql, inArray, gte, lte, lt, ne, isNull, avg } from 'drizzle-orm';
import { users, vendors, categories, services, addons, serviceFaqs, bookings, reviews, menuItems, banners, coupons, wishlists, homepageSections, notifications, recentlyViewed, cities, settings, payments, employeeBookingAssignments, bookingNotes, bookingTimeline, followUps, employeeTasks, availabilitySlots, seoPages } from '../../db/schema/index';

const router = Router();

router.use(authenticate);
router.use(requireInvestor);

// ==================== EXECUTIVE SUMMARY ====================

// GET /api/investor/executive-summary
router.get('/executive-summary', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const thisYearStart = new Date(now.getFullYear(), 0, 1);
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);

    const [
      totalRevenueRows, lastMonthRevenueRows, thisMonthRevenueRows,
      lastYearRevenueRows, thisYearRevenueRows,
      totalBookingsRows, lastMonthBookingsRows, thisMonthBookingsRows,
      completedEventsRows,
      activeVendorsRows, totalCustomersRows, totalEmployeesRows,
      totalCommissionRows,
      recentMonthlyRevenue,
    ] = await Promise.all([
      db.select({ total: sum(bookings.commission) }).from(bookings),
      db.select({ total: sum(bookings.commission) }).from(bookings).where(and(gte(bookings.createdAt, lastMonthStart.toISOString()), lte(bookings.createdAt, lastMonthEnd.toISOString()))),
      db.select({ total: sum(bookings.commission) }).from(bookings).where(gte(bookings.createdAt, thisMonthStart.toISOString())),
      db.select({ total: sum(bookings.commission) }).from(bookings).where(and(gte(bookings.createdAt, lastYearStart.toISOString()), lte(bookings.createdAt, lastYearEnd.toISOString()))),
      db.select({ total: sum(bookings.commission) }).from(bookings).where(gte(bookings.createdAt, thisYearStart.toISOString())),
      db.select({ value: count() }).from(bookings),
      db.select({ value: count() }).from(bookings).where(and(gte(bookings.createdAt, lastMonthStart.toISOString()), lte(bookings.createdAt, lastMonthEnd.toISOString()))),
      db.select({ value: count() }).from(bookings).where(gte(bookings.createdAt, thisMonthStart.toISOString())),
      db.select({ value: count() }).from(bookings).where(eq(bookings.status, 'COMPLETED')),
      db.select({ value: count() }).from(vendors).where(eq(vendors.status, 'APPROVED')),
      db.select({ value: count() }).from(users).where(eq(users.role, 'CLIENT')),
      db.select({ value: count() }).from(users).where(eq(users.role, 'EMPLOYEE')),
      db.select({ total: sum(bookings.commission) }).from(bookings),
      // Monthly revenue for last 6 months for sparkline
      db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') as month,
               COALESCE(SUM("totalAmount"), 0)::float as revenue,
               COUNT(*)::int as bookings
        FROM bookings
        WHERE "createdAt" >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY month ASC
      `),
    ]);

    const totalRev = Number(totalRevenueRows[0]?.total || 0);
    const thisMonthRev = Number(thisMonthRevenueRows[0]?.total || 0);
    const lastMonthRev = Number(lastMonthRevenueRows[0]?.total || 0);
    const thisYearRev = Number(thisYearRevenueRows[0]?.total || 0);
    const lastYearRev = Number(lastYearRevenueRows[0]?.total || 0);
    const commissionRev = Number(totalCommissionRows[0]?.total || 0);
    const totalBookings = Number(totalBookingsRows[0]?.value || 0);
    const lastMonthBookings = Number(lastMonthBookingsRows[0]?.value || 0);
    const thisMonthBookings = Number(thisMonthBookingsRows[0]?.value || 0);
    const completedEvents = Number(completedEventsRows[0]?.value || 0);
    const activeVendors = Number(activeVendorsRows[0]?.value || 0);
    const totalCustomers = Number(totalCustomersRows[0]?.value || 0);
    const totalEmployees = Number(totalEmployeesRows[0]?.value || 0);

    const monthlyGrowth = lastMonthRev > 0 ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100 * 10) / 10 : 0;
    const yearlyGrowth = lastYearRev > 0 ? Math.round(((thisYearRev - lastYearRev) / lastYearRev) * 100 * 10) / 10 : 0;
    const bookingGrowth = lastMonthBookings > 0 ? Math.round(((thisMonthBookings - lastMonthBookings) / lastMonthBookings) * 100 * 10) / 10 : 0;
    const avgBookingValue = totalBookings > 0 ? Math.round(totalRev / totalBookings) : 0;
    const grossProfit = commissionRev;
    const netProfit = Math.round(grossProfit * 0.65);

    ApiResponse.success(res, {
      kpis: {
        totalRevenue: totalRev,
        totalBookings,
        completedEvents,
        activeVendors,
        totalCustomers,
        totalEmployees,
        monthlyRevenueGrowth: monthlyGrowth,
        yearlyRevenueGrowth: yearlyGrowth,
        grossProfit,
        netProfit,
        avgBookingValue,
        commissionRevenue: commissionRev,
      },
      growth: {
        thisMonthRevenue: thisMonthRev,
        lastMonthRevenue: lastMonthRev,
        thisMonthBookings,
        lastMonthBookings,
        bookingGrowth,
      },
      recentMonthlyRevenue,
    });
  } catch (error) {
    next(error);
  }
});

// ==================== REVENUE ANALYTICS ====================

// GET /api/investor/revenue?period=monthly
router.get('/revenue', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { period = 'monthly' } = req.query;

    let dateFormat: string;
    let interval: string;
    switch (period) {
      case 'daily': dateFormat = 'YYYY-MM-DD'; interval = '30 days'; break;
      case 'weekly': dateFormat = 'IYYY-IW'; interval = '12 weeks'; break;
      case 'quarterly': dateFormat = 'YYYY-"Q"Q'; interval = '2 years'; break;
      case 'yearly': dateFormat = 'YYYY'; interval = '5 years'; break;
      default: dateFormat = 'YYYY-MM'; interval = '12 months'; break;
    }

    const [revenueTrend, revenueByCategory, revenueByCity, financialMetrics] = await Promise.all([
      // Revenue trend
      db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('${sql.raw(period === 'weekly' ? 'week' : period === 'quarterly' ? 'quarter' : period === 'yearly' ? 'year' : period === 'daily' ? 'day' : 'month')}', b."createdAt"), '${sql.raw(dateFormat)}') as period,
               COALESCE(SUM(b."totalAmount"), 0)::float as revenue,
               COUNT(*)::int as bookings
        FROM bookings b
        WHERE b."createdAt" >= NOW() - INTERVAL '${sql.raw(interval)}'
        GROUP BY 1
        ORDER BY 1 ASC
      `),
      // Revenue by category
      db.execute(sql`
        SELECT c.name as category,
               COALESCE(SUM(b."totalAmount"), 0)::float as revenue,
               COUNT(*)::int as bookings
        FROM bookings b
        JOIN services s ON b."serviceId" = s.id
        JOIN categories c ON s."categoryId" = c.id
        GROUP BY c.name
        ORDER BY revenue DESC
        LIMIT 10
      `),
      // Revenue by city
      db.execute(sql`
        SELECT b.city,
               COALESCE(SUM(b."totalAmount"), 0)::float as revenue,
               COUNT(*)::int as bookings
        FROM bookings b
        WHERE b.city IS NOT NULL
        GROUP BY b.city
        ORDER BY revenue DESC
        LIMIT 10
      `),
      // Financial summary
      Promise.all([
        db.select({ totalAmount: sum(bookings.totalAmount), commission: sum(bookings.commission), couponDiscount: sum(bookings.couponDiscount) }).from(bookings),
        db.select({ amount: sum(payments.amount) }).from(payments).where(eq(payments.status, 'COMPLETED')),
        db.select({ amount: sum(payments.amount) }).from(payments).where(eq(payments.type, 'REFUND')),
        db.select({ amount: sum(payments.amount) }).from(payments).where(eq(payments.status, 'PENDING')),
      ]),
    ]);

    const [bookingAgg, paymentsCompleted, refunds, pendingPayments] = financialMetrics;
    const totalRev = Number(bookingAgg[0]?.totalAmount || 0);
    const commissionEarned = Number(bookingAgg[0]?.commission || 0);
    const vendorPayouts = totalRev - commissionEarned;

    ApiResponse.success(res, {
      revenueTrend,
      revenueByCategory,
      revenueByCity,
      financials: {
        totalRevenue: totalRev,
        commissionEarned,
        vendorPayouts,
        pendingPayments: Number(pendingPayments[0]?.amount || 0),
        refunds: Number(refunds[0]?.amount || 0),
        couponDiscounts: Number(bookingAgg[0]?.couponDiscount || 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==================== BOOKING ANALYTICS ====================

// GET /api/investor/bookings
router.get('/bookings', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo, city, category } = req.query;

    const conditions: any[] = [];
    if (dateFrom || dateTo) {
      const dateConds: any[] = [];
      if (dateFrom) dateConds.push(gte(bookings.createdAt, new Date(dateFrom as string).toISOString()));
      if (dateTo) dateConds.push(lte(bookings.createdAt, new Date(dateTo as string).toISOString()));
      conditions.push(and(...dateConds));
    }
    if (city) conditions.push(eq(bookings.city, city as string));
    if (category) {
      // Filter by category name via subquery
      const categoryServiceIds = await db.select({ id: services.id })
        .from(services)
        .leftJoin(categories, eq(services.categoryId, categories.id))
        .where(ilike(categories.name, category as string));
      const serviceIds = categoryServiceIds.map(s => s.id);
      if (serviceIds.length > 0) {
        conditions.push(inArray(bookings.serviceId, serviceIds));
      } else {
        conditions.push(eq(bookings.serviceId, -1)); // No matches
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [
      statusBreakdown,
      bookingGrowth,
      categoryDist,
      cityDist,
      pipelineBreakdown,
    ] = await Promise.all([
      // Status breakdown
      db.select({
        status: bookings.status,
        count: count(),
        totalAmount: sum(bookings.totalAmount),
      }).from(bookings).where(whereClause).groupBy(bookings.status),
      // Booking growth trend (last 6 months)
      db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') as month,
               COUNT(*)::int as bookings,
               COALESCE(SUM("totalAmount"), 0)::float as revenue
        FROM bookings
        WHERE "createdAt" >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY month ASC
      `),
      // Category distribution
      db.execute(sql`
        SELECT c.name as category,
               COUNT(*)::int as bookings,
               COALESCE(SUM(b."totalAmount"), 0)::float as revenue
        FROM bookings b
        JOIN services s ON b."serviceId" = s.id
        JOIN categories c ON s."categoryId" = c.id
        GROUP BY c.name
        ORDER BY bookings DESC
      `),
      // City distribution
      db.execute(sql`
        SELECT city,
               COUNT(*)::int as bookings,
               COALESCE(SUM("totalAmount"), 0)::float as revenue
        FROM bookings
        WHERE city IS NOT NULL
        GROUP BY city
        ORDER BY bookings DESC
        LIMIT 10
      `),
      // Pipeline breakdown
      db.select({
        pipelineStatus: bookings.pipelineStatus,
        count: count(),
      }).from(bookings).groupBy(bookings.pipelineStatus),
    ]);

    const total = statusBreakdown.reduce((s: number, r: any) => s + Number(r.count), 0);

    ApiResponse.success(res, {
      total,
      statusBreakdown: statusBreakdown.map((s: any) => ({
        status: s.status,
        count: Number(s.count),
        revenue: Number(s.totalAmount || 0),
      })),
      bookingGrowth,
      categoryDistribution: categoryDist,
      cityDistribution: cityDist,
      pipelineBreakdown: pipelineBreakdown.map((p: any) => ({
        status: p.pipelineStatus,
        count: Number(p.count),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// ==================== CUSTOMER ANALYTICS ====================

// GET /api/investor/customers
router.get('/customers', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const [
      totalCustomersRows, newCustomersRows, lastMonthNewCustomersRows,
      customersWithBookingsRows,
      returningCustomers,
      customerGrowth,
      revenuePerCustomer,
      avgRatingRows,
    ] = await Promise.all([
      db.select({ value: count() }).from(users).where(eq(users.role, 'CLIENT')),
      db.select({ value: count() }).from(users).where(and(eq(users.role, 'CLIENT'), gte(users.createdAt, thirtyDaysAgo.toISOString()))),
      db.select({ value: count() }).from(users).where(and(eq(users.role, 'CLIENT'), gte(users.createdAt, sixtyDaysAgo.toISOString()), lt(users.createdAt, thirtyDaysAgo.toISOString()))),
      // Active customers (have at least 1 booking)
      db.select({ value: count() }).from(users).where(and(
        eq(users.role, 'CLIENT'),
        sql`EXISTS (SELECT 1 FROM ${bookings} WHERE ${bookings.clientId} = ${users.id})`,
      )),
      // Returning customers (have 2+ bookings)
      db.execute(sql`
        SELECT COUNT(*)::int as count FROM (
          SELECT "clientId" FROM bookings GROUP BY "clientId" HAVING COUNT(*) >= 2
        ) sub
      `),
      // Customer growth (last 6 months)
      db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') as month,
               COUNT(*)::int as new_customers
        FROM users
        WHERE role = 'CLIENT' AND "createdAt" >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY month ASC
      `),
      // Revenue per customer
      db.execute(sql`
        SELECT COALESCE(AVG(total), 0)::float as avg_spend,
               COALESCE(MAX(total), 0)::float as max_spend
        FROM (
          SELECT "clientId", SUM("totalAmount")::float as total
          FROM bookings
          GROUP BY "clientId"
        ) sub
      `),
      db.select({ avg: avg(reviews.rating) }).from(reviews),
    ]);

    const totalCustomers = Number(totalCustomersRows[0]?.value || 0);
    const newCustomers = Number(newCustomersRows[0]?.value || 0);
    const lastMonthNewCustomers = Number(lastMonthNewCustomersRows[0]?.value || 0);
    const customersWithBookings = Number(customersWithBookingsRows[0]?.value || 0);
    const returningCount = (returningCustomers as any[])[0]?.count || 0;
    const retentionRate = customersWithBookings > 0
      ? Math.round((returningCount / customersWithBookings) * 100 * 10) / 10
      : 0;
    const revenueData = (revenuePerCustomer as any[])[0] || {};
    const lifetimeValue = Math.round(revenueData.avg_spend || 0);
    const repeatRate = customersWithBookings > 0
      ? Math.round((returningCount / customersWithBookings) * 100 * 10) / 10
      : 0;

    ApiResponse.success(res, {
      totalCustomers,
      activeCustomers: customersWithBookings,
      newCustomers,
      returningCustomers: returningCount,
      retentionRate,
      lifetimeValue,
      avgSpend: lifetimeValue,
      repeatRate,
      customerSatisfaction: Number(avgRatingRows[0]?.avg || 0).toFixed(1),
      customerGrowth,
      growth: {
        newCustomers,
        lastMonthNewCustomers,
        growthRate: lastMonthNewCustomers > 0
          ? Math.round(((newCustomers - lastMonthNewCustomers) / lastMonthNewCustomers) * 100 * 10) / 10
          : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==================== VENDOR ANALYTICS ====================

// GET /api/investor/vendors
router.get('/vendors', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalVendorsRows, activeVendorsRows, newVendorsRows,
      topByRevenue, topByBookings, topByRating,
      categoryPerformance,
    ] = await Promise.all([
      db.select({ value: count() }).from(vendors),
      db.select({ value: count() }).from(vendors).where(eq(vendors.status, 'APPROVED')),
      db.select({ value: count() }).from(vendors).where(gte(vendors.createdAt, thirtyDaysAgo.toISOString())),
      // Top vendors by revenue
      db.execute(sql`
        SELECT v.id, v."businessName",
               COALESCE(SUM(b."totalAmount"), 0)::float as revenue,
               COUNT(b.id)::int as bookings,
               v."avgRating"::float as rating
        FROM vendors v
        LEFT JOIN bookings b ON b."vendorId" = v.id
        WHERE v.status = 'APPROVED'
        GROUP BY v.id, v."businessName", v."avgRating"
        ORDER BY revenue DESC
        LIMIT 10
      `),
      // Top by bookings
      db.execute(sql`
        SELECT v.id, v."businessName",
               COUNT(b.id)::int as bookings,
               COALESCE(SUM(b."totalAmount"), 0)::float as revenue,
               v."avgRating"::float as rating
        FROM vendors v
        LEFT JOIN bookings b ON b."vendorId" = v.id
        WHERE v.status = 'APPROVED'
        GROUP BY v.id, v."businessName", v."avgRating"
        ORDER BY bookings DESC
        LIMIT 10
      `),
      // Top by rating
      db.execute(sql`
        SELECT v.id, v."businessName",
               v."avgRating"::float as rating,
               v."reviewCount"::int as reviews,
               COUNT(b.id)::int as bookings
        FROM vendors v
        LEFT JOIN bookings b ON b."vendorId" = v.id
        WHERE v.status = 'APPROVED' AND v."reviewCount" > 0
        GROUP BY v.id, v."businessName", v."avgRating", v."reviewCount"
        ORDER BY v."avgRating" DESC
        LIMIT 10
      `),
      // Category performance
      db.execute(sql`
        SELECT c.name as category,
               COUNT(DISTINCT v.id)::int as vendors,
               COUNT(b.id)::int as bookings,
               COALESCE(SUM(b."totalAmount"), 0)::float as revenue
        FROM categories c
        JOIN services s ON s."categoryId" = c.id
        LEFT JOIN vendors v ON s."vendorId" = v.id
        LEFT JOIN bookings b ON b."serviceId" = s.id
        WHERE c."parentId" IS NULL
        GROUP BY c.name
        ORDER BY revenue DESC
      `),
    ]);

    const totalVendors = Number(totalVendorsRows[0]?.value || 0);
    const activeVendors = Number(activeVendorsRows[0]?.value || 0);
    const newVendors = Number(newVendorsRows[0]?.value || 0);

    ApiResponse.success(res, {
      totalVendors,
      activeVendors,
      newVendors,
      pendingApproval: totalVendors - activeVendors,
      topByRevenue,
      topByBookings,
      topByRating,
      categoryPerformance,
    });
  } catch (error) {
    next(error);
  }
});

// ==================== EMPLOYEE PERFORMANCE ====================

// GET /api/investor/employees
router.get('/employees', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [
      employeesRows,
      leaderboard,
      overallConversion,
    ] = await Promise.all([
      db.select({ value: count() }).from(users).where(eq(users.role, 'EMPLOYEE')),
      // Employee leaderboard
      db.execute(sql`
        SELECT u.id, u.name, u.email,
               COUNT(DISTINCT b.id)::int as leads_handled,
               COUNT(DISTINCT CASE WHEN b."pipelineStatus" IN ('BOOKING_CONFIRMED','PLANNING_STAGE','EVENT_PREPARATION','EVENT_ONGOING','EVENT_COMPLETED','CLOSED') THEN b.id END)::int as leads_converted,
               COALESCE(SUM(CASE WHEN b."pipelineStatus" IN ('BOOKING_CONFIRMED','EVENT_COMPLETED','CLOSED') THEN b."totalAmount" ELSE 0 END), 0)::float as revenue_generated,
               COUNT(DISTINCT CASE WHEN f.status = 'COMPLETED' THEN f.id END)::int as followups_completed,
               COUNT(DISTINCT f.id)::int as total_followups
        FROM users u
        LEFT JOIN bookings b ON b."assignedEmployeeId" = u.id
        LEFT JOIN follow_ups f ON f."employeeId" = u.id
        WHERE u.role = 'EMPLOYEE'
        GROUP BY u.id, u.name, u.email
        ORDER BY revenue_generated DESC
      `),
      // Overall conversion stats
      db.execute(sql`
        SELECT
          COUNT(*)::int as total_leads,
          COUNT(CASE WHEN "pipelineStatus" IN ('BOOKING_CONFIRMED','PLANNING_STAGE','EVENT_PREPARATION','EVENT_ONGOING','EVENT_COMPLETED','CLOSED') THEN 1 END)::int as converted
        FROM bookings
        WHERE "assignedEmployeeId" IS NOT NULL
      `),
    ]);

    const employees = Number(employeesRows[0]?.value || 0);
    const conversionData = (overallConversion as any[])[0] || {};
    const conversionRate = conversionData.total_leads > 0
      ? Math.round((conversionData.converted / conversionData.total_leads) * 100 * 10) / 10
      : 0;

    // Add conversion rate to leaderboard entries
    const enrichedLeaderboard = (leaderboard as any[]).map((emp: any) => ({
      ...emp,
      conversion_rate: emp.leads_handled > 0
        ? Math.round((emp.leads_converted / emp.leads_handled) * 100 * 10) / 10
        : 0,
    }));

    ApiResponse.success(res, {
      totalEmployees: employees,
      overallConversionRate: conversionRate,
      totalLeads: conversionData.total_leads || 0,
      totalConverted: conversionData.converted || 0,
      leaderboard: enrichedLeaderboard,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
