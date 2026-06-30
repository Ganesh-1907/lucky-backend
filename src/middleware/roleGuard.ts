import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { ApiError } from '../utils/apiError';

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Insufficient permissions'));
    }

    next();
  };
}

export function requireAdmin(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(ApiError.forbidden('Admin access required'));
  }
  next();
}

export function requireVendor(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'VENDOR') {
    return next(ApiError.forbidden('Vendor access required'));
  }
  next();
}

export function requireEmployee(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.user || !['EMPLOYEE', 'ADMIN'].includes(req.user.role)) {
    return next(ApiError.forbidden('Employee access required'));
  }
  next();
}

export function requireInvestor(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!req.user || !['INVESTOR', 'ADMIN'].includes(req.user.role)) {
    return next(ApiError.forbidden('Investor access required'));
  }
  next();
}
