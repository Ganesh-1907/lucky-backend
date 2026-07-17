import db from './src/config/database';
import { bookings } from './db/schema/index';
import { eq, gte, lt, and } from 'drizzle-orm';

async function test() {
  const startDate = new Date(2026, 6, 1).toISOString();
  const endDate = new Date(2026, 7, 1).toISOString();
  
  console.log("startDate:", startDate);
  
  const b = await db.query.bookings.findMany({
    where: and(
      gte(bookings.bookingDate, startDate),
      lt(bookings.bookingDate, endDate)
    )
  });
  console.log("Bookings fetched with ISO:", b.length);
  process.exit(0);
}
test();
