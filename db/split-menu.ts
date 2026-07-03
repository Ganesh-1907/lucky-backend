import { db } from '../src/config/database';
import { menuItems } from './schema/index';
import { eq, like, inArray } from 'drizzle-orm';

async function main() {
  console.log('Splitting Cakes & Flowers in Menu Items...');

  // Find 'Cakes & Flowers' top-level item
  const items = await db.select().from(menuItems).where(like(menuItems.label, '%Cakes & Flowers%')).limit(1);
  if (!items || items.length === 0) {
    console.log('Cakes & Flowers not found. Maybe already split?');
    return;
  }
  const cakesAndFlowers = items[0];

  // Update existing to just 'Cakes'
  await db.update(menuItems)
    .set({ label: 'Cakes', url: '/category/cakes' })
    .where(eq(menuItems.id, cakesAndFlowers.id));
  
  console.log('Updated Cakes & Flowers -> Cakes');

  // Find max sortOrder to place Flowers at the end
  const allTopLevel = await db.select().from(menuItems).where(eq(menuItems.parentId, null as any));
  const maxSort = allTopLevel.reduce((max, item) => Math.max(max, item.sortOrder || 0), 0);

  // Create 'Flowers' top-level item
  const [flowers] = await db.insert(menuItems).values({
    label: 'Flowers',
    url: '/category/flowers',
    column: 'main',
    sortOrder: maxSort + 1,
    isActive: true,
  }).returning();

  console.log('Created new top-level Menu Item: Flowers');

  // Move flower-related children to the new Flowers parent
  const flowerChildren = ['Bouquets', 'Flower Decoration'];
  
  const childrenToMove = await db.select().from(menuItems)
    .where(eq(menuItems.parentId, cakesAndFlowers.id));

  for (const child of childrenToMove) {
    if (flowerChildren.includes(child.label)) {
      await db.update(menuItems)
        .set({ parentId: flowers.id })
        .where(eq(menuItems.id, child.id));
      console.log(`Moved ${child.label} to Flowers`);
    }
  }

  console.log('Menu splitting completed successfully!');
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
