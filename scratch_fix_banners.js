require('dotenv').config();
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL);

async function fixBanners() {
  const banners = await sql`SELECT * FROM banners ORDER BY position, "sortOrder", id`;
  
  console.log('Total banners:', banners.length);
  
  const positionMap = {};
  
  for (const banner of banners) {
    if (!positionMap[banner.position]) {
      positionMap[banner.position] = { nextOrder: 1, titles: new Set() };
    }
    
    let isDuplicate = false;
    
    // Check title duplicate
    if (positionMap[banner.position].titles.has(banner.title)) {
      isDuplicate = true;
      console.log(`Deleting duplicate banner (title): ${banner.title} in ${banner.position} (ID: ${banner.id})`);
    }
    
    if (isDuplicate) {
      await sql`DELETE FROM banners WHERE id = ${banner.id}`;
      continue;
    }
    
    positionMap[banner.position].titles.add(banner.title);
    
    // Re-assign order to ensure no gaps/duplicates
    const newOrder = positionMap[banner.position].nextOrder++;
    
    if (banner.sortOrder !== newOrder) {
      console.log(`Updating ${banner.title} in ${banner.position} order from ${banner.sortOrder} to ${newOrder}`);
      await sql`UPDATE banners SET "sortOrder" = ${newOrder} WHERE id = ${banner.id}`;
    }
  }
  
  console.log('Banners fixed.');
  process.exit(0);
}

fixBanners().catch(console.error);
