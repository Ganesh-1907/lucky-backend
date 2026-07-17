import db from './src/config/database';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS address text;`);
    await db.execute(sql`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS preferences jsonb;`);
    console.log('Columns added successfully');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
