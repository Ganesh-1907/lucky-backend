const postgres = require('postgres');
const dotenv = require('dotenv');

dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

async function migrate() {
  try {
    console.log('Running migrations...');
    
    // Add new enum values if they don't exist
    try {
      await sql`ALTER TYPE banner_position ADD VALUE 'CATEGORY'`;
      console.log('Added CATEGORY to banner_position');
    } catch (e) {
      console.log('CATEGORY already exists or error:', e.message);
    }
    
    try {
      await sql`ALTER TYPE banner_position ADD VALUE 'HOMEPAGE'`;
      console.log('Added HOMEPAGE to banner_position');
    } catch (e) {
      console.log('HOMEPAGE already exists or error:', e.message);
    }
    
    try {
      await sql`ALTER TYPE banner_position ADD VALUE 'CUSTOM'`;
      console.log('Added CUSTOM to banner_position');
    } catch (e) {
      console.log('CUSTOM already exists or error:', e.message);
    }

    // Add new columns to banners table
    const columns = [
      `ALTER TABLE banners ADD COLUMN description text`,
      `ALTER TABLE banners ADD COLUMN priority integer NOT NULL DEFAULT 0`,
      `ALTER TABLE banners ADD COLUMN visibility jsonb`,
      `ALTER TABLE banners ADD COLUMN clicks integer NOT NULL DEFAULT 0`,
      `ALTER TABLE banners ADD COLUMN impressions integer NOT NULL DEFAULT 0`,
      `ALTER TABLE banners ADD COLUMN "createdBy" integer`,
      `ALTER TABLE banners ADD COLUMN "updatedBy" integer`
    ];

    for (const query of columns) {
      try {
        await sql.unsafe(query);
        console.log(`Executed: ${query}`);
      } catch (e) {
        console.log(`Failed or already exists: ${query} - ${e.message}`);
      }
    }

    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await sql.end();
  }
}

migrate();
