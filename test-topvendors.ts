import db from './src/config/database';
import { bookings, vendors, users } from './db/schema/index';
import { sum, count, eq, inArray, desc } from 'drizzle-orm';

(async () => {
  const topVendors = await db.select({
    name: vendors.businessName,
    city: users.city,
    rating: vendors.avgRating,
    revenue: sum(bookings.commission),
    bookings: count()
  }).from(bookings)
    .innerJoin(vendors, eq(bookings.vendorId, vendors.id))
    .innerJoin(users, eq(vendors.userId, users.id))
    .where(inArray(bookings.status, ['CONFIRMED', 'COMPLETED']))
    .groupBy(vendors.id, vendors.businessName, users.city, vendors.avgRating)
    .orderBy(desc(sum(bookings.commission)))
    .limit(10);
    
  console.log('topVendors query result:', JSON.stringify(topVendors, null, 2));
  process.exit(0);
})();
