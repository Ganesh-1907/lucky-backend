import db from './src/config/database';
import { bookings } from './db/schema';
import { sql, sum, inArray, gte, and } from 'drizzle-orm';

async function main() {
  const data = await db.select({
    month: sql<string>`TO_CHAR(${bookings.createdAt}, 'Mon')`,
    revenue: sum(bookings.totalAmount)
  }).from(bookings).where(
    and(
      inArray(bookings.status, ['CONFIRMED', 'COMPLETED']), 
      gte(bookings.createdAt, new Date(new Date().getFullYear(), 0, 1).toISOString())
    )
  ).groupBy(sql`TO_CHAR(${bookings.createdAt}, 'Mon')`);
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

main();
