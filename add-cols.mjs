import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetPasswordToken" varchar`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS "resetPasswordExpires" timestamp`;
    console.log('Columns added successfully.');
  } catch (err) {
    console.error('Error adding columns:', err);
  } finally {
    await sql.end();
  }
}

main();
