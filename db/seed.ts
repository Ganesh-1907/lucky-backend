import { db } from '../src/config/database';
import * as bcrypt from 'bcryptjs';
import { users, cities as citiesTable, categories, menuItems, homepageSections, banners, settings, vendors, services, addons, coupons } from './schema/index';
import { eq, sql } from 'drizzle-orm';

async function main() {
  console.log('🌱 Seeding database...');

  // Create Admin User
  const adminPassword = await bcrypt.hash('admin123', 12);
  const [admin] = await db.insert(users).values({
    email: 'admin@yopmail.com',
    password: adminPassword,
    name: 'Super Admin',
    role: 'ADMIN',
    isActive: true,
    emailVerified: true,
  }).onConflictDoNothing().returning();
  if (admin) console.log('✅ Admin user created:', admin.email);

  // Create Cities
  const cityData = [
    { name: 'Mumbai', slug: 'mumbai', state: 'Maharashtra' },
    { name: 'Delhi', slug: 'delhi', state: 'Delhi' },
    { name: 'Bangalore', slug: 'bangalore', state: 'Karnataka' },
    { name: 'Hyderabad', slug: 'hyderabad', state: 'Telangana' },
    { name: 'Chennai', slug: 'chennai', state: 'Tamil Nadu' },
    { name: 'Pune', slug: 'pune', state: 'Maharashtra' },
    { name: 'Kolkata', slug: 'kolkata', state: 'West Bengal' },
    { name: 'Jaipur', slug: 'jaipur', state: 'Rajasthan' },
    { name: 'Ahmedabad', slug: 'ahmedabad', state: 'Gujarat' },
    { name: 'Lucknow', slug: 'lucknow', state: 'Uttar Pradesh' },
  ];

  for (const city of cityData) {
    await db.insert(citiesTable).values({ ...city, isActive: true }).onConflictDoNothing();
  }
  console.log('✅ Cities created');

  // Create Categories
  const categoryTree = [
    {
      name: 'Birthday Decorations', slug: 'birthday-decorations', icon: '🎂',
      description: 'Make birthdays memorable with stunning decorations',
      children: [
        { name: 'Balloon Decorations', slug: 'balloon-decorations', icon: '🎈' },
        { name: 'Theme Decorations', slug: 'theme-decorations', icon: '🎨' },
        { name: 'Simple Decorations', slug: 'simple-decorations', icon: '✨' },
        { name: 'Premium Decorations', slug: 'premium-decorations', icon: '👑' },
      ],
    },
    {
      name: 'Wedding Decorations', slug: 'wedding-decorations', icon: '💒',
      description: 'Beautiful wedding setups for your special day',
      children: [
        { name: 'Mandap Decoration', slug: 'mandap-decoration', icon: '🕌' },
        { name: 'Stage Decoration', slug: 'stage-decoration', icon: '🎭' },
        { name: 'Car Decoration', slug: 'car-decoration', icon: '🚗' },
        { name: 'Haldi & Mehendi', slug: 'haldi-mehendi', icon: '💛' },
      ],
    },
    {
      name: 'Anniversary Celebrations', slug: 'anniversary-celebrations', icon: '💕',
      description: 'Celebrate your love with romantic setups',
      children: [
        { name: 'Candlelight Dinner', slug: 'candlelight-dinner', icon: '🕯️' },
        { name: 'Romantic Setup', slug: 'romantic-setup', icon: '🌹' },
        { name: 'Surprise Planning', slug: 'surprise-planning', icon: '🎁' },
      ],
    },
    {
      name: 'Cakes', slug: 'cakes', icon: '🎂',
      description: 'Delicious cakes for every occasion',
      children: [
        { name: 'Birthday Cakes', slug: 'birthday-cakes', icon: '🎂' },
        { name: 'Wedding Cakes', slug: 'wedding-cakes', icon: '🎂' },
        { name: 'Custom Cakes', slug: 'custom-cakes', icon: '🎂' },
        { name: 'Photo Cakes', slug: 'photo-cakes', icon: '📸' },
      ],
    },
    {
      name: 'Flowers', slug: 'flowers', icon: '💐',
      description: 'Fresh flower arrangements and bouquets',
      children: [
        { name: 'Bouquets', slug: 'bouquets', icon: '💐' },
        { name: 'Flower Baskets', slug: 'flower-baskets', icon: '🧺' },
        { name: 'Flower Decoration', slug: 'flower-decoration', icon: '🌸' },
      ],
    },
    {
      name: 'Corporate Events', slug: 'corporate-events', icon: '🏢',
      description: 'Professional event setups for businesses',
      children: [
        { name: 'Conference Setup', slug: 'conference-setup', icon: '📊' },
        { name: 'Team Party', slug: 'team-party', icon: '🎉' },
        { name: 'Product Launch', slug: 'product-launch', icon: '🚀' },
      ],
    },
  ];

  for (let i = 0; i < categoryTree.length; i++) {
    const { children, ...parentData } = categoryTree[i];
    const [parent] = await db.insert(categories).values({ ...parentData, sortOrder: i, isActive: true }).onConflictDoNothing().returning();
    if (parent && children) {
      for (let j = 0; j < children.length; j++) {
        await db.insert(categories).values({ ...children[j], parentId: parent.id, sortOrder: j, isActive: true }).onConflictDoNothing();
      }
    }
  }
  console.log('✅ Categories created');

  // Create Menu Items
  const menuTree = [
    {
      label: 'Decorations', url: '/category/decorations', column: 'main',
      children: [
        { label: 'Birthday Decorations', url: '/category/birthday-decorations', column: 'categories' },
        { label: 'Wedding Decorations', url: '/category/wedding-decorations', column: 'categories' },
        { label: 'Anniversary Celebrations', url: '/category/anniversary-celebrations', column: 'categories' },
        { label: 'Baby Shower', url: '/category/baby-shower', column: 'categories' },
      ],
    },
    {
      label: 'Cakes & Flowers', url: '/category/cakes-flowers', column: 'main',
      children: [
        { label: 'Birthday Cakes', url: '/category/birthday-cakes', column: 'products' },
        { label: 'Wedding Cakes', url: '/category/wedding-cakes', column: 'products' },
        { label: 'Bouquets', url: '/category/bouquets', column: 'products' },
        { label: 'Flower Decoration', url: '/category/flower-decoration', column: 'products' },
      ],
    },
    {
      label: 'Events', url: '/category/events', column: 'main',
      children: [
        { label: 'Candlelight Dinner', url: '/category/candlelight-dinner', column: 'events' },
        { label: 'Surprise Planning', url: '/category/surprise-planning', column: 'events' },
        { label: 'Corporate Events', url: '/category/corporate-events', column: 'events' },
        { label: 'House Party', url: '/category/house-party', column: 'events' },
      ],
    },
    {
      label: 'By Occasion', url: '/occasions', column: 'main',
      children: [
        { label: 'Birthday', url: '/occasion/birthday', column: 'occasions' },
        { label: 'Wedding', url: '/occasion/wedding', column: 'occasions' },
        { label: 'Anniversary', url: '/occasion/anniversary', column: 'occasions' },
        { label: "Valentine's Day", url: '/occasion/valentines-day', column: 'occasions' },
        { label: 'New Year', url: '/occasion/new-year', column: 'occasions' },
      ],
    },
  ];

  for (let i = 0; i < menuTree.length; i++) {
    const { children, ...parentData } = menuTree[i];
    const [parent] = await db.insert(menuItems).values({ ...parentData, sortOrder: i, isActive: true }).returning();
    if (children) {
      for (let j = 0; j < children.length; j++) {
        await db.insert(menuItems).values({ ...children[j], parentId: parent.id, sortOrder: j, isActive: true });
      }
    }
  }
  console.log('✅ Menu items created');

  // Create Homepage Sections
  const sections = [
    { name: 'hero_banner', type: 'banner', title: 'Hero Banner', sortOrder: 0, isActive: true },
    { name: 'categories', type: 'categories', title: 'Browse Categories', subtitle: 'Find the perfect service for your celebration', sortOrder: 1, isActive: true },
    { name: 'trending', type: 'services', title: 'Trending Now', subtitle: 'Most popular services this month', sortOrder: 2, isActive: true, config: { tag: 'trending', limit: 8 } },
    { name: 'best_sellers', type: 'services', title: 'Best Sellers', subtitle: 'Top rated services loved by our customers', sortOrder: 3, isActive: true, config: { tag: 'bestseller', limit: 8 } },
    { name: 'new_arrivals', type: 'services', title: 'New Arrivals', subtitle: 'Fresh services just added', sortOrder: 4, isActive: true, config: { tag: 'new', limit: 8 } },
    { name: 'featured', type: 'services', title: 'Featured Services', subtitle: 'Hand-picked premium services', sortOrder: 5, isActive: true, config: { tag: 'featured', limit: 8 } },
    { name: 'cities', type: 'cities', title: 'Available Cities', subtitle: 'We serve across major cities in India', sortOrder: 6, isActive: true },
    { name: 'testimonials', type: 'testimonials', title: 'What Our Customers Say', subtitle: 'Real reviews from real people', sortOrder: 7, isActive: true },
  ];

  for (const section of sections) {
    await db.insert(homepageSections).values(section as any);
  }
  console.log('✅ Homepage sections created');

  // Create Banners
  const bannerData = [
    { title: 'Make Every Celebration Unforgettable', subtitle: 'Book premium decoration services for any occasion', image: 'https://images.unsplash.com/photo-1530103862676-de8892bf30b9?w=1600&q=80', link: '/services', position: 'HERO', sortOrder: 0, isActive: true },
    { title: 'Wedding Season Special', subtitle: 'Up to 20% off on wedding decorations', image: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1600&q=80', link: '/category/wedding-decorations', position: 'HERO', sortOrder: 1, isActive: true },
    { title: 'Surprise Your Loved Ones', subtitle: 'Romantic candlelight dinner setups starting ₹2999', image: 'https://images.unsplash.com/photo-1518893883800-45cd0954574b?w=1600&q=80', link: '/category/candlelight-dinner', position: 'HERO', sortOrder: 2, isActive: true },
  ];

  for (const b of bannerData) {
    await db.insert(banners).values(b as any);
  }
  console.log('✅ Banners created');

  // Create Settings
  const settingData = [
    { key: 'site_name', value: 'Lucky Marketplace', group: 'general' },
    { key: 'site_tagline', value: 'Your one-stop destination for celebration services', group: 'general' },
    { key: 'contact_email', value: 'support@luckymarketplace.com', group: 'general' },
    { key: 'contact_phone', value: '+91 9876543210', group: 'general' },
    { key: 'default_commission', value: '10', group: 'payment' },
    { key: 'min_advance_percent', value: '50', group: 'payment' },
    { key: 'cancellation_hours', value: '24', group: 'booking' },
    { key: 'currency', value: 'INR', group: 'payment' },
    { key: 'currency_symbol', value: '₹', group: 'payment' },
  ];

  for (const s of settingData) {
    await db.insert(settings).values(s).onConflictDoUpdate({ target: settings.key, set: { value: s.value } });
  }
  console.log('✅ Settings created');

  // Create Vendor
  const vendorPassword = await bcrypt.hash('vendor123', 12);
  const [vendorUser] = await db.insert(users).values({
    email: 'vendor@yopmail.com',
    password: vendorPassword,
    name: 'Dream Decorators',
    phone: '+91 9876543211',
    role: 'VENDOR',
    city: 'Mumbai',
    isActive: true,
    emailVerified: true,
  }).onConflictDoNothing().returning();

  if (vendorUser) {
    const [vendor] = await db.insert(vendors).values({
      userId: vendorUser.id,
      businessName: 'Dream Decorators',
      description: 'Premium decoration services for all occasions.',
      status: 'APPROVED',
      commissionRate: '10',
      serviceCities: JSON.stringify(['Mumbai', 'Pune', 'Delhi']),
    }).returning();
    console.log('✅ Sample vendor created');

    // Create Services
    const [balloonCat] = await db.select().from(categories).where(eq(categories.slug, 'balloon-decorations')).limit(1);
    const [candlelightCat] = await db.select().from(categories).where(eq(categories.slug, 'candlelight-dinner')).limit(1);
    const [weddingCat] = await db.select().from(categories).where(eq(categories.slug, 'wedding-decorations')).limit(1);
    const [birthdayCat] = await db.select().from(categories).where(eq(categories.slug, 'birthday-decorations')).limit(1);

    const sampleServices = [
      {
        vendorId: vendor.id, categoryId: balloonCat?.id || birthdayCat?.id || 1,
        title: 'Premium Birthday Balloon Decoration', slug: 'premium-birthday-balloon-decoration',
        description: 'Transform your space with our premium balloon decoration package.',
        shortDesc: 'Premium balloon setup with LED lights, backdrop & personalized banner',
        basePrice: '4999', discountPrice: '3999',
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1560298803-1d998f6b5245?w=800&q=80',
          'https://images.unsplash.com/photo-1558636508-e0db3814bd1d?w=800&q=80',
          'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=800&q=80',
        ]),
        tags: JSON.stringify(['birthday', 'balloons', 'decoration']),
        status: 'APPROVED', isActive: true, isTrending: true, isBestSeller: true, isNewArrival: false, isFeatured: true,
        minAdvancePercent: 50, cities: JSON.stringify(['Mumbai', 'Pune', 'Delhi']),
        avgRating: '4.5', reviewCount: 128, bookingCount: 456,
      },
      {
        vendorId: vendor.id, categoryId: candlelightCat?.id || 1,
        title: 'Romantic Candlelight Dinner Setup', slug: 'romantic-candlelight-dinner-setup',
        description: 'Create magical moments with our premium candlelight dinner setup.',
        shortDesc: 'Romantic dinner with candles, rose petals & fairy lights',
        basePrice: '5999', discountPrice: '4499',
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1518893883800-45cd0954574b?w=800&q=80',
          'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=800&q=80',
          'https://images.unsplash.com/photo-1478146059778-9e4f6a8e1d7e?w=800&q=80',
        ]),
        tags: JSON.stringify(['romantic', 'dinner', 'candlelight']),
        status: 'APPROVED', isActive: true, isTrending: true, isNewArrival: true, isFeatured: true,
        minAdvancePercent: 50, cities: JSON.stringify(['Mumbai', 'Delhi', 'Bangalore']),
        avgRating: '4.8', reviewCount: 89, bookingCount: 234,
      },
      {
        vendorId: vendor.id, categoryId: weddingCat?.id || 1,
        title: 'Royal Wedding Stage Decoration', slug: 'royal-wedding-stage-decoration',
        description: 'Elegant and royal stage decoration for your wedding.',
        shortDesc: 'Royal wedding stage with flowers, draping & LED backdrop',
        basePrice: '49999', discountPrice: '39999',
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&q=80',
          'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=800&q=80',
          'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=800&q=80',
        ]),
        tags: JSON.stringify(['wedding', 'stage', 'decoration', 'premium']),
        status: 'APPROVED', isActive: true, isBestSeller: true, isFeatured: true,
        minAdvancePercent: 30, cities: JSON.stringify(['Mumbai', 'Delhi', 'Hyderabad', 'Jaipur']),
        avgRating: '4.9', reviewCount: 56, bookingCount: 123,
      },
      {
        vendorId: vendor.id, categoryId: birthdayCat?.id || 1,
        title: 'Kids Birthday Theme Party Setup', slug: 'kids-birthday-theme-party-setup',
        description: 'Complete theme party setup for kids.',
        shortDesc: 'Complete kids theme party with character setup & return gifts',
        basePrice: '7999', discountPrice: '5999',
        images: JSON.stringify([
          'https://images.unsplash.com/photo-1558636508-e0db3814bd1d?w=800&q=80',
          'https://images.unsplash.com/photo-1560298803-1d998f6b5245?w=800&q=80',
          'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=800&q=80',
        ]),
        tags: JSON.stringify(['birthday', 'kids', 'theme', 'party']),
        status: 'APPROVED', isActive: true, isTrending: true, isNewArrival: true,
        minAdvancePercent: 50, cities: JSON.stringify(['Mumbai', 'Pune', 'Bangalore', 'Chennai']),
        avgRating: '4.6', reviewCount: 72, bookingCount: 189,
      },
    ];

    for (const service of sampleServices) {
      const [existing] = await db.select().from(services).where(eq(services.slug, service.slug)).limit(1);
      if (!existing) {
        const [created] = await db.insert(services).values(service as any).returning();

        if (created.slug === 'premium-birthday-balloon-decoration') {
          await db.insert(addons).values([
            { serviceId: created.id, name: 'Birthday Cake (1kg)', description: 'Delicious chocolate/vanilla cake', price: '799', sortOrder: 0 },
            { serviceId: created.id, name: 'Extra Balloons (50)', description: 'Additional premium balloons', price: '499', sortOrder: 1 },
            { serviceId: created.id, name: 'Fog Machine', description: 'Adds dramatic fog effect', price: '999', sortOrder: 2 },
            { serviceId: created.id, name: 'Confetti Cannon', description: 'Party confetti poppers (set of 4)', price: '599', sortOrder: 3 },
            { serviceId: created.id, name: 'Photo Booth Setup', description: 'Backdrop with props for photos', price: '1499', sortOrder: 4 },
          ]);
        } else if (created.slug === 'romantic-candlelight-dinner-setup') {
          await db.insert(addons).values([
            { serviceId: created.id, name: 'Rose Bouquet', description: 'Fresh red roses bouquet', price: '599', sortOrder: 0 },
            { serviceId: created.id, name: 'Guitar Player', description: 'Live guitar performance', price: '1999', sortOrder: 1 },
            { serviceId: created.id, name: 'Chocolate Fountain', description: 'Premium chocolate fountain', price: '1499', sortOrder: 2 },
            { serviceId: created.id, name: 'Cake (500g)', description: 'Heart shaped cake', price: '599', sortOrder: 3 },
          ]);
        }
      }
    }
    console.log('✅ Sample services & addons created');
  }

  // Create Client
  const clientPassword = await bcrypt.hash('client123', 12);
  await db.insert(users).values({
    email: 'client@yopmail.com',
    password: clientPassword,
    name: 'Rahul Sharma',
    phone: '+91 9876543212',
    role: 'CLIENT',
    city: 'Mumbai',
    isActive: true,
    emailVerified: true,
  }).onConflictDoNothing();
  console.log('✅ Sample client created');

  // Create Coupon
  await db.insert(coupons).values({
    code: 'WELCOME20',
    type: 'PERCENTAGE',
    value: '20',
    minOrder: '1000',
    maxDiscount: '500',
    usageLimit: 1000,
    validFrom: new Date().toISOString(),
    validTo: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    isActive: true,
    description: 'Get 20% off on your first booking',
  }).onConflictDoNothing();
  console.log('✅ Sample coupon created');

  console.log('\n🎉 Database seeded successfully!');
  console.log('Admin login: admin@yopmail.com / admin123');
  console.log('Vendor login: vendor@yopmail.com / vendor123');
  console.log('Client login: client@yopmail.com / client123');
}

main()
  .catch((e) => { console.error('❌ Seed error:', e); process.exit(1); })
  .finally(async () => { process.exit(0); });
