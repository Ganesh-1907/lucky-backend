import db from './src/config/database';
import { bookings, payments } from './db/schema/index';
import { desc } from 'drizzle-orm';
async function test() {
  try {
    const bs = await db.query.bookings.findMany({ orderBy: [desc(bookings.createdAt)], limit: 5 });
    for (const b of bs) {
        console.log(`Booking ${b.id}: total=${b.totalAmount}, advance=${b.advancePaid}, remaining=${b.remainingAmount}, status=${b.status}`);
    }
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
test();
