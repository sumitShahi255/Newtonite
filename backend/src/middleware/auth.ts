import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../db';
import { UnauthorizedError } from '../errors';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  memberships: Array<{
    teamId: string;
    role: string;
    teamName: string;
  }>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function generateToken(payload: { id: string; email: string; name: string }): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    const token = authHeader.substring(7);
    let decoded: any;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (err: any) {
      throw new UnauthorizedError('Token is invalid or expired');
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        memberships: {
          include: {
            team: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('User referenced by token no longer exists');
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      memberships: user.memberships.map((m) => ({
        teamId: m.teamId,
        role: m.role,
        teamName: m.team.name,
      })),
    };

    next();
  } catch (err) {
    next(err);
  }
}
