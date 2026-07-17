import db from './src/config/database';
import { users, vendors, services, bookings } from './db/schema/index';

async function test() {
  const allVendors = await db.query.vendors.findMany({
    with: {
      user: { columns: { email: true } }
    }
  });
  console.log("VENDORS:", JSON.stringify(allVendors, null, 2));

  const allServices = await db.query.services.findMany();
  console.log("SERVICES:", JSON.stringify(allServices, null, 2));

  const allBookings = await db.query.bookings.findMany();
  console.log("BOOKINGS:", JSON.stringify(allBookings, null, 2));

  process.exit(0);
}

test();
