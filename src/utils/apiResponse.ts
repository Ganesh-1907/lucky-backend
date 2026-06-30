import { Response } from 'express';
import { serialize } from './serialize';

export class ApiResponse {
  static success<T>(res: Response, data: T, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data: serialize(data),
    });
  }

  static created<T>(res: Response, data: T, message = 'Created successfully') {
    return res.status(201).json({
      success: true,
      message,
      data: serialize(data),
    });
  }

  static paginated<T>(
    res: Response,
    data: T[],
    pagination: { page: number; limit: number; total: number },
    message = 'Success'
  ) {
    return res.status(200).json({
      success: true,
      message,
      data: serialize(data),
      pagination: {
        ...pagination,
        totalPages: Math.ceil(pagination.total / pagination.limit),
      },
    });
  }

  static error(res: Response, message: string, statusCode = 500) {
    return res.status(statusCode).json({
      success: false,
      error: message,
    });
  }

  static noContent(res: Response) {
    return res.status(204).send();
  }
}
