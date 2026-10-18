import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        name: err.name,
        message: err.message,
        details: err.details || null,
      },
    });
  }

  // Handle Zod validation errors
  if (err?.name === 'ZodError') {
    return res.status(400).json({
      error: {
        name: 'ValidationError',
        message: 'Invalid request body or parameters',
        details: err.errors,
      },
    });
  }

  console.error('[Unhandled Error]', err);
  return res.status(500).json({
    error: {
      name: 'InternalServerError',
      message: 'An unexpected internal error occurred on the server',
    },
  });
}
