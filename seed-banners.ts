import db from './src/config/database';
import { banners } from './db/schema/index';

async function seed() {
  await db.insert(banners).values([
    {
      title: 'Summer Sale Popup',
      description: 'Get 20% off all birthday decorations this summer!',
      position: 'POPUP',
      image: 'https://images.unsplash.com/photo-1530103862676-de8892bf30b9?w=800&q=80',
      link: '/category/birthday-decorations',
      isActive: true,
      sortOrder: 1,
      priority: 1
    },
    {
      title: 'Homepage Special',
      description: 'Check out our new premium setups.',
      position: 'HOMEPAGE',
      image: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1600&q=80',
      link: '/services',
      isActive: true,
      sortOrder: 1,
      priority: 1
    },
    {
      title: 'Category Exclusive',
      description: 'Special deals for this category only.',
      position: 'CATEGORY',
      image: 'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=1200&q=80',
      link: '#',
      isActive: true,
      sortOrder: 1,
      priority: 1
    }
  ]);
  console.log('Seeded banners');
  process.exit(0);
}
seed().catch(console.error);
