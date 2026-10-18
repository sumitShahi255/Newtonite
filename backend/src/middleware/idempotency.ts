import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../db';

export function idempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only apply idempotency to mutating HTTP methods (POST, PUT, PATCH, DELETE)
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const idempotencyKey =
      (req.headers['idempotency-key'] as string) ||
      (req.headers['x-idempotency-key'] as string);

    if (!idempotencyKey || typeof idempotencyKey !== 'string') {
      return next();
    }

    const userId = req.user?.id || 'anonymous';
    const requestHash = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          method: req.method,
          path: req.originalUrl,
          body: req.body || {},
          userId,
        })
      )
      .digest('hex');

    try {
      // Check if this idempotency key already exists
      const existing = await prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });

      if (existing) {
        // If the key has already finished processing
        if (existing.statusCode !== null && existing.responseBody !== null) {
          // Verify that the request parameters match the original request
          if (existing.requestHash !== requestHash) {
            return res.status(422).json({
              error: {
                name: 'IdempotencyConflictError',
                message:
                  'Idempotency key was previously used with a different request payload or endpoint',
              },
            });
          }

          // Return the cached response
          res.setHeader('Idempotency-Replayed', 'true');
          res.setHeader('X-Cache-Lookup', 'HIT');
          return res.status(existing.statusCode).type('application/json').send(existing.responseBody);
        }

        // If the request is still locked / in-flight
        return res.status(409).json({
          error: {
            name: 'ConcurrentIdempotencyExecution',
            message:
              'A request with this Idempotency-Key is currently in flight. Please retry shortly.',
          },
        });
      }

      // Record in-flight idempotency key
      await prisma.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          userId,
          requestPath: req.originalUrl,
          requestHash,
          lockedAt: new Date(),
        },
      });

      // Intercept the response to store final status and body
      const originalSend = res.send.bind(res);
      res.send = function (body: any): Response {
        const statusCode = res.statusCode;
        const responseBodyString =
          typeof body === 'string' ? body : JSON.stringify(body);

        // Asynchronously persist the response body without blocking the client return
        prisma.idempotencyKey
          .update({
            where: { key: idempotencyKey },
            data: {
              statusCode,
              responseBody: responseBodyString,
              lockedAt: null,
            },
          })
          .catch((err) => {
            console.error('[Idempotency Store Error]', err);
          });

        return originalSend(body);
      };

      next();
    } catch (err) {
      console.error('[Idempotency Middleware Error]', err);
      next(err);
    }
  };
}
