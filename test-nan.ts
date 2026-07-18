import db from './src/config/database';
import { bookings } from './db/schema/index';
import { eq, and, desc, count, sum, inArray, gte, sql } from 'drizzle-orm';

async function test() {
  try {
    console.log("Testing admin monthly revenue...");
    const monthlyRevenueResult = await db.select({
      month: sql<string>`TO_CHAR(${bookings.createdAt}, 'Mon')`,
      revenue: sum(bookings.commission),
      orders: count(),
    }).from(bookings).where(
      and(
        inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), 
        gte(bookings.createdAt, new Date(new Date().getFullYear(), 0, 1).toISOString())
      )
    ).groupBy(sql`TO_CHAR(${bookings.createdAt}, 'Mon')`);

    console.log("monthlyRevenueResult:", monthlyRevenueResult);
    
    // Test what happens in the controller mapping
    const monthlyRevData: Record<string, number> = {};
    if (Array.isArray(monthlyRevenueResult)) {
      monthlyRevenueResult.forEach((row: any) => {
        if (row.month) {
          monthlyRevData[row.month.trim().toLowerCase()] = Number(row.revenue || 0);
        }
      });
    }
    console.log("Mapped monthlyRevData:", monthlyRevData);

    const allBookings = await db.select({
      id: bookings.id,
      status: bookings.status,
      createdAt: bookings.createdAt,
      commission: bookings.commission
    }).from(bookings);
    console.log("All bookings:", allBookings);

  } catch (error) {
    console.error("Error:", error);
  }
  process.exit(0);
}

test();
