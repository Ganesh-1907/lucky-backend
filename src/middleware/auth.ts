import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import db from '../config/database';
import { users } from '../../db/schema/index';
import { ApiError } from '../utils/apiError';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
  };
}

export async function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('No token provided');
    }

    if (!process.env.JWT_SECRET) {
      throw ApiError.internal('JWT_SECRET not configured');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;

    const result = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);

    const user = result[0];

    if (!user) {
      throw ApiError.unauthorized('User not found');
    }

    if (!user.isActive) {
      throw ApiError.forbidden('Account is deactivated');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(ApiError.unauthorized('Invalid token'));
    }
  }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  if (!process.env.JWT_SECRET) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
    db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1)
      .then((result) => {
        const user = result[0];
        if (user && user.isActive) {
          req.user = user;
        }
        next();
      })
      .catch(() => next());
  } catch {
    next();
  }
}
