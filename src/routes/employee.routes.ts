import { Router, Response, NextFunction } from 'express';
import db from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireEmployee } from '../middleware/roleGuard';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { eq, and, or, like, ilike, desc, asc, count, sum, sql, inArray, gte, lte, lt, ne, isNull } from 'drizzle-orm';
import { users, vendors, categories, services, addons, serviceFaqs, bookings, reviews, menuItems, banners, coupons, wishlists, homepageSections, notifications, recentlyViewed, cities, settings, payments, employeeBookingAssignments, bookingNotes, bookingTimeline, followUps, employeeTasks, availabilitySlots, seoPages } from '../../db/schema/index';

const router = Router();

// All routes require authentication + employee role
router.use(authenticate);
router.use(requireEmployee);

// ==================== DASHBOARD ====================

// GET /api/employee/dashboard
router.get('/dashboard', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const assignedWhere = eq(bookings.assignedEmployeeId, employeeId);

    const [
      totalAssignedRows,
      todaysEventsRows,
      upcomingEventsRows,
      pendingFollowUpsRows,
      completedFollowUpsRows,
      newInquiriesRows,
      closedBookingsRows,
      revenueRows,
      overdueFollowUps,
      todaysFollowUps,
      recentBookings,
    ] = await Promise.all([
      db.select({ value: count() }).from(bookings).where(assignedWhere),
      db.select({ value: count() }).from(bookings).where(and(assignedWhere, gte(bookings.bookingDate, today.toISOString()), lt(bookings.bookingDate, tomorrow.toISOString()))),
      db.select({ value: count() }).from(bookings).where(and(assignedWhere, gte(bookings.bookingDate, tomorrow.toISOString()), lt(bookings.bookingDate, nextWeek.toISOString()))),
      db.select({ value: count() }).from(followUps).where(and(eq(followUps.employeeId, employeeId), eq(followUps.status, 'PENDING'))),
      db.select({ value: count() }).from(followUps).where(and(eq(followUps.employeeId, employeeId), eq(followUps.status, 'COMPLETED'))),
      db.select({ value: count() }).from(bookings).where(and(assignedWhere, eq(bookings.pipelineStatus, 'NEW_LEAD'))),
      db.select({ value: count() }).from(bookings).where(and(assignedWhere, eq(bookings.pipelineStatus, 'CLOSED'))),
      db.select({ total: sum(bookings.totalAmount) }).from(bookings).where(assignedWhere),
      db.query.followUps.findMany({
        where: and(eq(followUps.employeeId, employeeId), eq(followUps.status, 'PENDING'), lt(followUps.followUpDate, today.toISOString())),
        with: { booking: { columns: { bookingNumber: true } } },
        orderBy: [asc(followUps.followUpDate)],
        limit: 5,
      }),
      db.query.followUps.findMany({
        where: and(eq(followUps.employeeId, employeeId), gte(followUps.followUpDate, today.toISOString()), lt(followUps.followUpDate, tomorrow.toISOString())),
        with: { booking: { columns: { bookingNumber: true } } },
        orderBy: [asc(followUps.followUpTime)],
        limit: 10,
      }),
      db.query.bookings.findMany({
        where: assignedWhere,
        with: {
          client: { columns: { name: true, phone: true, email: true } },
          service: { columns: { title: true } },
          vendor: { with: { user: { columns: { name: true } } } },
        },
        orderBy: [desc(bookings.updatedAt)],
        limit: 5,
      }),
    ]);

    const totalAssigned = Number(totalAssignedRows[0].value);
    const todaysEvents = Number(todaysEventsRows[0].value);
    const upcomingEvents = Number(upcomingEventsRows[0].value);
    const pendingFollowUps = Number(pendingFollowUpsRows[0].value);
    const completedFollowUps = Number(completedFollowUpsRows[0].value);
    const newInquiries = Number(newInquiriesRows[0].value);
    const closedBookings = Number(closedBookingsRows[0].value);
    const revenue = Number(revenueRows[0]?.total || 0);

    // Vendor/Customer responses awaiting action = bookings in specific pipeline stages
    const [vendorResponsesRows] = await Promise.all([
      db.select({ value: count() }).from(bookings).where(and(assignedWhere, eq(bookings.pipelineStatus, 'VENDOR_CONFIRMATION_PENDING'))),
    ]);
    const vendorResponsesAwaiting = Number(vendorResponsesRows[0].value);

    const [customerResponsesRows] = await Promise.all([
      db.select({ value: count() }).from(bookings).where(and(assignedWhere, inArray(bookings.pipelineStatus, ['CUSTOMER_CONTACTED', 'CUSTOMER_DISCUSSION']))),
    ]);
    const customerResponsesAwaiting = Number(customerResponsesRows[0].value);

    ApiResponse.success(res, {
      stats: {
        totalAssigned,
        todaysEvents,
        upcomingEvents,
        pendingFollowUps,
        completedFollowUps,
        newInquiries,
        vendorResponsesAwaiting,
        customerResponsesAwaiting,
        closedBookings,
        revenue,
      },
      overdueFollowUps,
      todaysFollowUps,
      recentBookings,
    });
  } catch (error) {
    next(error);
  }
});

// ==================== BOOKINGS ====================

// GET /api/employee/bookings
router.get('/bookings', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const {
      status, pipelineStatus, priority, search, city,
      dateFrom, dateTo, page = '1', limit = '20',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const conditions: any[] = [eq(bookings.assignedEmployeeId, employeeId)];
    if (status) conditions.push(eq(bookings.status, status as any));
    if (pipelineStatus) conditions.push(eq(bookings.pipelineStatus, pipelineStatus as any));
    if (priority) conditions.push(eq(bookings.priority, priority as any));
    if (city) conditions.push(ilike(bookings.city, `%${city}%`));

    if (dateFrom || dateTo) {
      const dateConds: any[] = [];
      if (dateFrom) dateConds.push(gte(bookings.bookingDate, new Date(dateFrom as string).toISOString()));
      if (dateTo) dateConds.push(lte(bookings.bookingDate, new Date(dateTo as string).toISOString()));
      conditions.push(and(...dateConds));
    }

    // Handle search across related tables
    if (search) {
      const searchTerm = `%${search}%`;
      const matchingIds = await db.select({ id: bookings.id })
        .from(bookings)
        .leftJoin(users, eq(bookings.clientId, users.id))
        .leftJoin(services, eq(bookings.serviceId, services.id))
        .where(and(
          ...conditions,
          or(
            ilike(bookings.bookingNumber, searchTerm),
            ilike(users.name, searchTerm),
            ilike(services.title, searchTerm),
          ),
        ));
      const ids = matchingIds.map(b => b.id);
      if (ids.length === 0) {
        ApiResponse.paginated(res, [], { page: pageNum, limit: limitNum, total: 0 });
        return;
      }
      // Replace conditions with ID-only filter to avoid double-filtering
      conditions.length = 0;
      conditions.push(eq(bookings.assignedEmployeeId, employeeId), inArray(bookings.id, ids));
    }

    const [bookingsData, totalRows] = await Promise.all([
      db.query.bookings.findMany({
        where: and(...conditions),
        with: {
          client: { columns: { name: true, email: true, phone: true } },
          service: { columns: { title: true, images: true } },
          vendor: { with: { user: { columns: { name: true, phone: true, email: true } } } },
          bookingNotes: { orderBy: [desc(bookingNotes.createdAt)], limit: 1 },
          followUps: { where: eq(followUps.status, 'PENDING'), orderBy: [asc(followUps.followUpDate)], limit: 1 },
        },
        orderBy: [desc(bookings.updatedAt)],
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

// GET /api/employee/bookings/:id
router.get('/bookings/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const bookingId = parseInt(req.params.id);

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
      with: {
        client: { columns: { id: true, name: true, email: true, phone: true } },
        service: { columns: { title: true, images: true, slug: true }, with: { category: true } },
        vendor: { with: { user: { columns: { name: true, phone: true, email: true } } } },
        payments: { orderBy: [desc(payments.createdAt)] },
        review: true,
        bookingNotes: {
          with: { employee: { columns: { name: true } } },
          orderBy: [desc(bookingNotes.createdAt)],
        },
        bookingTimeline: {
          with: { employee: { columns: { name: true } } },
          orderBy: [desc(bookingTimeline.createdAt)],
        },
        followUps: {
          orderBy: [desc(followUps.followUpDate)],
        },
      },
    });

    if (!booking) throw ApiError.notFound('Booking not found');

    if (req.user!.role !== 'ADMIN' && booking.assignedEmployeeId !== employeeId) {
      throw ApiError.forbidden('You are not assigned to this booking');
    }

    ApiResponse.success(res, booking);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/employee/bookings/:id/pipeline — Update pipeline status
router.patch('/bookings/:id/pipeline', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const bookingId = parseInt(req.params.id);
    const { pipelineStatus, note } = req.body;

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) throw ApiError.notFound('Booking not found');
    if (req.user!.role !== 'ADMIN' && booking.assignedEmployeeId !== employeeId) {
      throw ApiError.forbidden();
    }

    // Create timeline entry + update booking in transaction
    let updated: typeof bookings.$inferSelect | undefined;
    await db.transaction(async (tx) => {
      [updated] = await tx.update(bookings).set({ pipelineStatus }).where(eq(bookings.id, bookingId)).returning();
      await tx.insert(bookingTimeline).values({
        bookingId,
        employeeId,
        fromStatus: booking.pipelineStatus,
        toStatus: pipelineStatus,
        note: note || null,
      });
    });

    ApiResponse.success(res, updated, 'Pipeline status updated');
  } catch (error) {
    next(error);
  }
});

// POST /api/employee/bookings/:id/notes — Add note
router.post('/bookings/:id/notes', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const bookingId = parseInt(req.params.id);
    const { content } = req.body;

    if (!content?.trim()) throw ApiError.badRequest('Note content is required');

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!booking) throw ApiError.notFound('Booking not found');
    if (req.user!.role !== 'ADMIN' && booking.assignedEmployeeId !== employeeId) {
      throw ApiError.forbidden();
    }

    const [note] = await db.insert(bookingNotes).values({
      bookingId,
      employeeId,
      content: content.trim(),
    }).returning();

    const noteWithEmployee = await db.query.bookingNotes.findFirst({
      where: eq(bookingNotes.id, note.id),
      with: { employee: { columns: { name: true } } },
    });

    ApiResponse.created(res, noteWithEmployee, 'Note added');
  } catch (error) {
    next(error);
  }
});

// ==================== FOLLOW-UPS ====================

// GET /api/employee/follow-ups
router.get('/follow-ups', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const { filter, status, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const conditions: any[] = [eq(followUps.employeeId, employeeId)];

    if (status) {
      conditions.push(eq(followUps.status, status as any));
    }

    if (filter === 'today') {
      conditions.push(and(gte(followUps.followUpDate, today.toISOString()), lt(followUps.followUpDate, tomorrow.toISOString())));
    } else if (filter === 'overdue') {
      conditions.push(lt(followUps.followUpDate, today.toISOString()));
      conditions.push(eq(followUps.status, 'PENDING'));
    } else if (filter === 'upcoming') {
      conditions.push(gte(followUps.followUpDate, tomorrow.toISOString()));
    }

    const [followUpsData, totalRows] = await Promise.all([
      db.query.followUps.findMany({
        where: and(...conditions),
        with: {
          booking: {
            columns: { bookingNumber: true },
            with: {
              service: { columns: { title: true } },
              client: { columns: { name: true, phone: true } },
            },
          },
        },
        orderBy: [asc(followUps.followUpDate)],
        offset: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(followUps).where(and(...conditions)),
    ]);

    const total = Number(totalRows[0].value);

    ApiResponse.paginated(res, followUpsData, { page: pageNum, limit: limitNum, total });
  } catch (error) {
    next(error);
  }
});

// POST /api/employee/follow-ups
router.post('/follow-ups', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const { bookingId, customerName, followUpDate, followUpTime, reminderNote } = req.body;

    if (!customerName || !followUpDate || !followUpTime) {
      throw ApiError.badRequest('Customer name, date, and time are required');
    }

    const [followUp] = await db.insert(followUps).values({
      employeeId,
      bookingId: bookingId ? parseInt(bookingId) : null,
      customerName,
      followUpDate: new Date(followUpDate).toISOString(),
      followUpTime,
      reminderNote: reminderNote || null,
    }).returning();

    const createdFollowUp = await db.query.followUps.findFirst({
      where: eq(followUps.id, followUp.id),
      with: { booking: { columns: { bookingNumber: true } } },
    });

    // Update lastFollowUpDate on booking
    if (bookingId) {
      await db.update(bookings).set({ lastFollowUpDate: new Date().toISOString() }).where(eq(bookings.id, parseInt(bookingId)));
    }

    ApiResponse.created(res, createdFollowUp, 'Follow-up scheduled');
  } catch (error) {
    next(error);
  }
});

// PATCH /api/employee/follow-ups/:id
router.patch('/follow-ups/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const followUpId = parseInt(req.params.id);
    const { status } = req.body;

    const [followUp] = await db.select().from(followUps).where(eq(followUps.id, followUpId)).limit(1);
    if (!followUp) throw ApiError.notFound('Follow-up not found');
    if (followUp.employeeId !== employeeId && req.user!.role !== 'ADMIN') {
      throw ApiError.forbidden();
    }

    const [updated] = await db.update(followUps).set({ status }).where(eq(followUps.id, followUpId)).returning();

    ApiResponse.success(res, updated, 'Follow-up updated');
  } catch (error) {
    next(error);
  }
});

// ==================== TASKS ====================

// GET /api/employee/tasks
router.get('/tasks', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const { status, priority, page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const conditions: any[] = [eq(employeeTasks.employeeId, employeeId)];
    if (status) conditions.push(eq(employeeTasks.status, status as any));
    if (priority) conditions.push(eq(employeeTasks.priority, priority as any));

    const [tasks, totalRows] = await Promise.all([
      db.query.employeeTasks.findMany({
        where: and(...conditions),
        orderBy: [asc(employeeTasks.status), asc(employeeTasks.dueDate)],
        offset: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(employeeTasks).where(and(...conditions)),
    ]);

    const total = Number(totalRows[0].value);

    ApiResponse.paginated(res, tasks, { page: pageNum, limit: limitNum, total });
  } catch (error) {
    next(error);
  }
});

// POST /api/employee/tasks
router.post('/tasks', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const { title, description, dueDate, priority } = req.body;

    if (!title || !dueDate) throw ApiError.badRequest('Title and due date are required');

    const [task] = await db.insert(employeeTasks).values({
      employeeId,
      title,
      description: description || null,
      dueDate: new Date(dueDate).toISOString(),
      priority: priority || 'MEDIUM',
    }).returning();

    ApiResponse.created(res, task, 'Task created');
  } catch (error) {
    next(error);
  }
});

// PATCH /api/employee/tasks/:id
router.patch('/tasks/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const taskId = parseInt(req.params.id);
    const { title, description, dueDate, priority, status } = req.body;

    const [task] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, taskId)).limit(1);
    if (!task) throw ApiError.notFound('Task not found');
    if (task.employeeId !== employeeId && req.user!.role !== 'ADMIN') {
      throw ApiError.forbidden();
    }

    const data: any = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (dueDate !== undefined) data.dueDate = new Date(dueDate).toISOString();
    if (priority !== undefined) data.priority = priority;
    if (status !== undefined) data.status = status;

    const [updated] = await db.update(employeeTasks).set(data).where(eq(employeeTasks.id, taskId)).returning();

    ApiResponse.success(res, updated, 'Task updated');
  } catch (error) {
    next(error);
  }
});

// DELETE /api/employee/tasks/:id
router.delete('/tasks/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const taskId = parseInt(req.params.id);

    const [task] = await db.select().from(employeeTasks).where(eq(employeeTasks.id, taskId)).limit(1);
    if (!task) throw ApiError.notFound('Task not found');
    if (task.employeeId !== employeeId && req.user!.role !== 'ADMIN') {
      throw ApiError.forbidden();
    }

    await db.delete(employeeTasks).where(eq(employeeTasks.id, taskId));
    ApiResponse.success(res, null, 'Task deleted');
  } catch (error) {
    next(error);
  }
});

// ==================== NOTIFICATIONS ====================

// GET /api/employee/notifications
router.get('/notifications', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const [notificationsData, totalRows, unreadRows] = await Promise.all([
      db.query.notifications.findMany({
        where: eq(notifications.userId, userId),
        orderBy: [desc(notifications.createdAt)],
        offset: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(notifications).where(eq(notifications.userId, userId)),
      db.select({ value: count() }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false))),
    ]);

    const total = Number(totalRows[0].value);
    const unreadCount = Number(unreadRows[0].value);

    res.json({
      success: true,
      data: notificationsData,
      unreadCount,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/employee/notifications/:id/read
router.patch('/notifications/:id/read', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const notificationId = parseInt(req.params.id);

    await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));

    ApiResponse.success(res, null, 'Notification marked as read');
  } catch (error) {
    next(error);
  }
});

// PATCH /api/employee/notifications/read-all
router.patch('/notifications/read-all', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    await db.update(notifications).set({ isRead: true }).where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    ApiResponse.success(res, null, 'All notifications marked as read');
  } catch (error) {
    next(error);
  }
});

// ==================== CALENDAR ====================

// GET /api/employee/calendar
router.get('/calendar', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;
    const { month, year } = req.query;

    const m = parseInt(month as string) || new Date().getMonth() + 1;
    const y = parseInt(year as string) || new Date().getFullYear();

    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0, 23, 59, 59);

    const [events, followUpsData, tasks] = await Promise.all([
      // Bookings/events
      db.query.bookings.findMany({
        where: and(
          eq(bookings.assignedEmployeeId, employeeId),
          gte(bookings.bookingDate, startDate.toISOString()),
          lte(bookings.bookingDate, endDate.toISOString()),
        ),
        columns: { id: true, bookingNumber: true, bookingDate: true, timeSlot: true, pipelineStatus: true },
        with: {
          service: { columns: { title: true } },
          client: { columns: { name: true } },
        },
        orderBy: [asc(bookings.bookingDate)],
      }),
      // Follow-ups
      db.query.followUps.findMany({
        where: and(
          eq(followUps.employeeId, employeeId),
          gte(followUps.followUpDate, startDate.toISOString()),
          lte(followUps.followUpDate, endDate.toISOString()),
        ),
        columns: { id: true, followUpDate: true, followUpTime: true, customerName: true, status: true, reminderNote: true },
        orderBy: [asc(followUps.followUpDate)],
      }),
      // Tasks
      db.query.employeeTasks.findMany({
        where: and(
          eq(employeeTasks.employeeId, employeeId),
          gte(employeeTasks.dueDate, startDate.toISOString()),
          lte(employeeTasks.dueDate, endDate.toISOString()),
        ),
        columns: { id: true, title: true, dueDate: true, priority: true, status: true },
        orderBy: [asc(employeeTasks.dueDate)],
      }),
    ]);

    ApiResponse.success(res, { events, followUps: followUpsData, tasks });
  } catch (error) {
    next(error);
  }
});

// ==================== PERFORMANCE ====================

// GET /api/employee/performance
router.get('/performance', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const employeeId = req.user!.id;

    const [
      totalFollowUpsCompletedRows,
      totalFollowUpsRows,
      bookingsConvertedRows,
      revenueRows,
      totalAssignedRows,
      pipelineBreakdown,
      monthlyPerformance,
    ] = await Promise.all([
      db.select({ value: count() }).from(followUps).where(and(eq(followUps.employeeId, employeeId), eq(followUps.status, 'COMPLETED'))),
      db.select({ value: count() }).from(followUps).where(eq(followUps.employeeId, employeeId)),
      db.select({ value: count() }).from(bookings).where(and(eq(bookings.assignedEmployeeId, employeeId), inArray(bookings.pipelineStatus, ['BOOKING_CONFIRMED', 'PLANNING_STAGE', 'EVENT_PREPARATION', 'EVENT_ONGOING', 'EVENT_COMPLETED', 'CLOSED']))),
      db.select({ total: sum(bookings.totalAmount) }).from(bookings).where(and(eq(bookings.assignedEmployeeId, employeeId), inArray(bookings.pipelineStatus, ['BOOKING_CONFIRMED', 'EVENT_COMPLETED', 'CLOSED']))),
      db.select({ value: count() }).from(bookings).where(eq(bookings.assignedEmployeeId, employeeId)),
      // Pipeline breakdown
      db.select({
        pipelineStatus: bookings.pipelineStatus,
        count: count(),
      }).from(bookings).where(eq(bookings.assignedEmployeeId, employeeId)).groupBy(bookings.pipelineStatus),
      // Monthly follow-ups completed (last 6 months)
      db.execute(sql`
        SELECT TO_CHAR(DATE_TRUNC('month', "updatedAt"), 'YYYY-MM') as month,
               COUNT(*)::int as count
        FROM follow_ups
        WHERE "employeeId" = ${employeeId} AND status = 'COMPLETED'
        AND "updatedAt" >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', "updatedAt")
        ORDER BY month ASC
      `),
    ]);

    const totalFollowUpsCompleted = Number(totalFollowUpsCompletedRows[0].value);
    const totalFollowUps = Number(totalFollowUpsRows[0].value);
    const bookingsConverted = Number(bookingsConvertedRows[0].value);
    const totalAssigned = Number(totalAssignedRows[0].value);
    const revenue = Number(revenueRows[0]?.total || 0);

    const conversionRate = totalAssigned > 0
      ? Math.round((bookingsConverted / totalAssigned) * 100)
      : 0;

    ApiResponse.success(res, {
      totalFollowUpsCompleted,
      totalFollowUps,
      bookingsConverted,
      totalAssigned,
      conversionRate,
      revenue,
      pipelineBreakdown,
      monthlyPerformance,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
