const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { sql } = require('drizzle-orm');
require('dotenv').config();

async function run() {
  const client = postgres(process.env.DATABASE_URL);
  const db = drizzle(client);
  
  try {
    const monthlyRevenueResult = await db.execute(sql`
      SELECT TO_CHAR("createdAt"::timestamp, 'Mon') as month, SUM("totalAmount") as revenue 
      FROM bookings 
      WHERE status IN ('CONFIRMED', 'COMPLETED') 
      GROUP BY TO_CHAR("createdAt"::timestamp, 'Mon')
    `);
    console.log('Result:', monthlyRevenueResult);
  } catch (e) {
    console.error('Error:', e);
  }
  process.exit(0);
}
run();
