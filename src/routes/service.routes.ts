import { Router, Request, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, and, or, ilike, desc, asc, gte, lte, ne, inArray, count, sql } from 'drizzle-orm';
import { services, categories, vendors, addons, serviceFaqs, reviews, recentlyViewed } from '../../db/schema/index';
import { authenticate, optionalAuth, AuthRequest } from '../middleware/auth';
import { requireVendor } from '../middleware/roleGuard';
import { ApiResponse } from '../utils/apiResponse';
import { ApiError } from '../utils/apiError';
import { generateSlug } from '../utils/helpers';

const router = Router();

router.get('/', optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      category, city, minPrice, maxPrice, rating,
      tags, search, sort, page = '1', limit = '12',
      featured, trending, bestseller, newArrival,
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const conditions = [
      eq(services.status, 'APPROVED'),
      eq(services.isActive, true),
    ];

    if (category) {
      const matchedCategory = await db.query.categories.findFirst({
        where: eq(categories.slug, category as string),
        with: { children: { columns: { id: true } } },
      });
      if (matchedCategory) {
        const categoryIds = [matchedCategory.id, ...matchedCategory.children.map((c: any) => c.id)];
        conditions.push(inArray(services.categoryId, categoryIds));
      } else {
        conditions.push(eq(services.categoryId, -1));
      }
    }

    if (city) {
      conditions.push(sql`${services.cities}::text ILIKE ${'%' + city + '%'}`);
    }

    const priceConditions = [];
    if (minPrice) priceConditions.push(gte(services.basePrice, parseFloat(minPrice as string)));
    if (maxPrice) priceConditions.push(lte(services.basePrice, parseFloat(maxPrice as string)));
    if (priceConditions.length > 0) conditions.push(and(...priceConditions));

    if (rating) {
      conditions.push(gte(services.avgRating, parseFloat(rating as string)));
    }

    if (search) {
      conditions.push(
        or(
          ilike(services.title, `%${search}%`),
          ilike(services.description, `%${search}%`),
          ilike(services.shortDesc, `%${search}%`),
        )
      );
    }

    if (featured === 'true') conditions.push(eq(services.isFeatured, true));
    if (trending === 'true') conditions.push(eq(services.isTrending, true));
    if (bestseller === 'true') conditions.push(eq(services.isBestSeller, true));
    if (newArrival === 'true') conditions.push(eq(services.isNewArrival, true));

    let orderBy: any = [desc(services.createdAt)];
    switch (sort) {
      case 'price_asc': orderBy = [asc(services.basePrice)]; break;
      case 'price_desc': orderBy = [desc(services.basePrice)]; break;
      case 'rating': orderBy = [desc(services.avgRating)]; break;
      case 'popular': orderBy = [desc(services.bookingCount)]; break;
      case 'newest': orderBy = [desc(services.createdAt)]; break;
    }

    const [servicesResult, totalResult] = await Promise.all([
      db.query.services.findMany({
        where: and(...conditions),
        with: {
          category: { columns: { id: true, name: true, slug: true } },
          vendor: { columns: { id: true, businessName: true, avgRating: true } },
        },
        orderBy,
        offset: skip,
        limit: limitNum,
      }),
      db.select({ value: count() }).from(services).where(and(...conditions)),
    ]);

    const total = Number(totalResult[0].value);

    ApiResponse.paginated(res, servicesResult, { page: pageNum, limit: limitNum, total });
  } catch (error) {
    next(error);
  }
});

router.get('/by-id/:id', optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = await db.query.services.findFirst({
      where: eq(services.id, parseInt(req.params.id)),
      with: {
        category: { with: { parent: true } },
        vendor: {
          columns: {
            id: true, businessName: true, description: true,
            avgRating: true, reviewCount: true, totalBookings: true,
            serviceCities: true,
          },
        },
        addons: {
          where: eq(addons.isActive, true),
          orderBy: [asc(addons.sortOrder)],
        }
      },
    });

    if (!service) {
      throw ApiError.notFound('Service not found');
    }

    ApiResponse.success(res, { service });
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', optionalAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = await db.query.services.findFirst({
      where: eq(services.slug, req.params.slug),
      with: {
        category: { with: { parent: true } },
        vendor: {
          columns: {
            id: true, businessName: true, description: true,
            avgRating: true, reviewCount: true, totalBookings: true,
            serviceCities: true,
          },
        },
        addons: {
          where: eq(addons.isActive, true),
          orderBy: [asc(addons.sortOrder)],
        },
        faq: { orderBy: [asc(serviceFaqs.sortOrder)] },
        reviews: {
          where: eq(reviews.isApproved, true),
          with: {
            client: { columns: { name: true, avatar: true } },
          },
          orderBy: [desc(reviews.createdAt)],
          limit: 10,
        },
      },
    });

    if (!service) {
      throw ApiError.notFound('Service not found');
    }

    await db.update(services).set({ viewCount: sql`${services.viewCount} + 1` }).where(eq(services.id, service.id));

    if (req.user) {
      const existing = await db.query.recentlyViewed.findFirst({
        where: and(eq(recentlyViewed.userId, req.user.id), eq(recentlyViewed.serviceId, service.id)),
      });
      if (existing) {
        await db.update(recentlyViewed).set({ viewedAt: new Date() }).where(eq(recentlyViewed.id, existing.id));
      } else {
        await db.insert(recentlyViewed).values({ userId: req.user.id, serviceId: service.id });
      }
    }

    const similar = await db.query.services.findMany({
      where: and(
        eq(services.categoryId, service.categoryId),
        ne(services.id, service.id),
        eq(services.status, 'APPROVED'),
        eq(services.isActive, true),
      ),
      with: {
        category: { columns: { id: true, name: true, slug: true } },
        vendor: { columns: { id: true, businessName: true, avgRating: true } },
      },
      limit: 4,
      orderBy: [desc(services.bookingCount)],
    });

    const recommended = await db.query.services.findMany({
      where: and(
        ne(services.id, service.id),
        eq(services.status, 'APPROVED'),
        eq(services.isActive, true),
        or(
          eq(services.isTrending, true),
          eq(services.isFeatured, true),
        ),
      ),
      with: {
        category: { columns: { id: true, name: true, slug: true } },
        vendor: { columns: { id: true, businessName: true, avgRating: true } },
      },
      limit: 4,
      orderBy: [desc(services.avgRating)],
    });

    ApiResponse.success(res, {
      service,
      similar,
      recommended,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor || vendor.status !== 'APPROVED') {
      throw ApiError.forbidden('Vendor not approved');
    }

    const {
      title, categoryId, description, shortDesc, basePrice, discountPrice,
      images, tags, cities, minAdvancePercent, preparationTime, serviceDuration,
      maxCapacity, addons: addonData, faq,
    } = req.body;

    const slug = generateSlug(title) + '-' + Date.now().toString(36);

    const result = await db.insert(services).values({
      vendorId: vendor.id,
      categoryId,
      title,
      slug,
      description,
      shortDesc,
      basePrice,
      discountPrice,
      images: JSON.stringify(images || []),
      tags: JSON.stringify(tags || []),
      cities: JSON.stringify(cities || []),
      status: 'PENDING',
      minAdvancePercent: minAdvancePercent || 50,
      preparationTime,
      serviceDuration,
      maxCapacity,
    }).returning();

    const service = result[0];

    if (addonData?.length) {
      await db.insert(addons).values(
        addonData.map((a: any, i: number) => ({
          serviceId: service.id,
          name: a.name,
          description: a.description,
          price: a.price,
          image: a.image,
          sortOrder: i,
        }))
      );
    }

    if (faq?.length) {
      await db.insert(serviceFaqs).values(
        faq.map((f: any, i: number) => ({
          serviceId: service.id,
          question: f.question,
          answer: f.answer,
          sortOrder: i,
        }))
      );
    }

    const created = await db.query.services.findFirst({
      where: eq(services.id, service.id),
      with: { addons: true, faq: true, category: true },
    });

    ApiResponse.created(res, created, 'Service created. Pending admin approval.');
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });

    const service = await db.query.services.findFirst({ where: eq(services.id, id) });
    if (!service || service.vendorId !== vendor?.id) {
      throw ApiError.forbidden('Not your service');
    }

    const {
      title, categoryId, description, shortDesc, basePrice, discountPrice,
      images, tags, cities, minAdvancePercent, preparationTime, serviceDuration,
    } = req.body;

    const data: any = {
      categoryId, description, shortDesc, basePrice, discountPrice,
      minAdvancePercent, preparationTime, serviceDuration,
    };

    if (title) {
      data.title = title;
      data.slug = generateSlug(title) + '-' + Date.now().toString(36);
    }
    if (images) data.images = JSON.stringify(images);
    if (tags) data.tags = JSON.stringify(tags);
    if (cities) data.cities = JSON.stringify(cities);

    const result = await db.update(services).set(data).where(eq(services.id, id)).returning();

    const updated = await db.query.services.findFirst({
      where: eq(services.id, id),
      with: { addons: true, category: true },
    });

    ApiResponse.success(res, updated, 'Service updated');
  } catch (error) {
    next(error);
  }
});

router.get('/vendor/my-services', authenticate, requireVendor, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const vendor = await db.query.vendors.findFirst({ where: eq(vendors.userId, req.user!.id) });
    if (!vendor) throw ApiError.notFound('Vendor profile not found');

    const result = await db.query.services.findMany({
      where: eq(services.vendorId, vendor.id),
      with: {
        category: { columns: { id: true, name: true, slug: true } },
      },
      orderBy: [desc(services.createdAt)],
    });

    ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
});

export default router;
