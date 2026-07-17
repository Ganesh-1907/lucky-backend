import db from './src/config/database';
import { notifications, users, vendors, bookings, services, categories } from './db/schema/index';
import { eq, and, desc, count, sum, inArray, gte, sql, avg } from 'drizzle-orm';

async function test() {
  try {
    const userId = 2; // Assuming vendor user id is 2, change if needed
    console.log("Testing notifications...");
    const unreadCountResult = await db.select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    
    console.log("Unread count:", unreadCountResult);

    const notificationsList = await db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      orderBy: [desc(notifications.createdAt)],
      limit: 20,
    });
    console.log("Notifications list length:", notificationsList.length);

  } catch (error) {
    console.error("Notifications error:", error);
  }

  try {
    const vendorId = 1;
    const startDateStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    console.log("Testing analytics...");
    const topServices = await db.select({ id: services.id, title: services.title, count: count(), revenue: sum(bookings.totalAmount) })
        .from(bookings).innerJoin(services, eq(bookings.serviceId, services.id))
        .where(and(eq(bookings.vendorId, vendorId), inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), gte(bookings.createdAt, startDateStr)))
        .groupBy(services.id, services.title)
        .orderBy(desc(sum(bookings.totalAmount)))
        .limit(5);

    console.log("Top services:", topServices);

    const statusDist = await db.select({ status: bookings.status, count: count() })
      .from(bookings)
      .where(and(eq(bookings.vendorId, vendorId), gte(bookings.createdAt, startDateStr)))
      .groupBy(bookings.status);

    console.log("Status dist:", statusDist);
  } catch (error) {
    console.error("Analytics error:", error);
  }

  process.exit(0);
}

test();
