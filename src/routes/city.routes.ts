import { Router, Request, Response, NextFunction } from 'express';
import db from '../config/database';
import { eq, asc } from 'drizzle-orm';
import { cities } from '../../db/schema/index';
import { ApiResponse } from '../utils/apiResponse';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await db.select().from(cities).where(eq(cities.isActive, true)).orderBy(asc(cities.sortOrder));
    ApiResponse.success(res, result);
  } catch (error) {
    next(error);
  }
});

export default router;
