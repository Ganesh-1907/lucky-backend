import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/apiError';
import { PostgresError } from 'postgres';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('Error:', err);

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  // Postgres errors
  if (err instanceof PostgresError) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'A record with this value already exists',
      });
    }
    if (err.code === '23503') {
      return res.status(409).json({
        success: false,
        error: 'Referenced record not found',
      });
    }
    if (err.code === '42P01') {
      return res.status(500).json({
        success: false,
        error: 'Database error',
      });
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired',
    });
  }

  // Multer errors
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
    });
  }

  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
}
