import db from './src/config/database';
import { bookings } from './db/schema/index';
import { eq, gte, lt, and } from 'drizzle-orm';

async function test() {
  const vendorId = 1;
  const month = 7;
  const year = 2026;
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 1).toISOString();

  const vendorBookings = await db.query.bookings.findMany({
    where: and(
      eq(bookings.vendorId, vendorId),
      gte(bookings.bookingDate, startDate),
      lt(bookings.bookingDate, endDate)
    )
  });

  const bookingsByDate: Record<string, any[]> = {};
  for (const b of vendorBookings) {
    const d = new Date(b.bookingDate);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!bookingsByDate[dateStr]) bookingsByDate[dateStr] = [];
    bookingsByDate[dateStr].push(b.id);
  }
  console.log("bookingsByDate:", JSON.stringify(bookingsByDate, null, 2));
  process.exit(0);
}
test();
