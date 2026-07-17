import db from './src/config/database';
import { bookings } from './db/schema/index';
import { eq, gte, lt, and } from 'drizzle-orm';

async function test() {
  const year = 2026;
  const month = 7;
  
  const startDate = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay} 23:59:59`;
  
  const vendorBookings = await db.query.bookings.findMany({
    where: and(
      gte(bookings.bookingDate, startDate),
      lt(bookings.bookingDate, endDate)
    )
  });
  
  const bookingsByDate: Record<string, any[]> = {};
  for (const b of vendorBookings) {
    const d = new Date(b.bookingDate);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    if (!bookingsByDate[dateStr]) {
      bookingsByDate[dateStr] = [];
    }
    bookingsByDate[dateStr].push(b);
  }
  
  console.log('bookingsByDate keys:', Object.keys(bookingsByDate));
  process.exit(0);
}
test();
