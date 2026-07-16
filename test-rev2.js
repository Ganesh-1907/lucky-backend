const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { sql, sum, and, inArray, gte } = require('drizzle-orm');
const { bookings } = require('./db/schema/index');
require('dotenv').config();

async function run() {
  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);
  
  try {
    const monthlyRevenueResult = await db.select({
      month: sql`TO_CHAR(${bookings.createdAt}::timestamp, 'Mon')`,
      revenue: sum(bookings.totalAmount),
    }).from(bookings).where(
      and(
        inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), 
        gte(bookings.createdAt, new Date(new Date().getFullYear(), 0, 1).toISOString())
      )
    ).groupBy(sql`TO_CHAR(${bookings.createdAt}::timestamp, 'Mon')`);
    console.log('Result db.select:', monthlyRevenueResult);
  } catch (e) {
    console.error('Error:', e);
  }
  process.exit(0);
}
run();
