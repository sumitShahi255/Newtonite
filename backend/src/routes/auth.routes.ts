import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { generateToken, authenticate } from '../middleware/auth';
import { UnauthorizedError } from '../errors';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        memberships: {
          include: {
            team: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        memberships: user.memberships.map((m) => ({
          teamId: m.teamId,
          role: m.role,
          teamName: m.team.name,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, async (req, res) => {
  return res.json({ user: req.user });
});

/**
 * Returns available seeded demo users for 1-click reviewer authentication
 */
router.get('/demo-users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        memberships: {
          include: {
            team: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const demoProfiles = users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      roles: u.memberships.map((m) => `${m.role} (${m.team.name})`),
    }));

    return res.json({ users: demoProfiles });
  } catch (err) {
    next(err);
  }
});

export default router;
