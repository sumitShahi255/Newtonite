import { Router } from 'express';
import { prisma } from '../db';
import { authenticate } from '../middleware/auth';
import { assertTeamAccess } from '../middleware/authorize';

const router = Router();

router.use(authenticate);

/**
 * List all teams the user belongs to (or all teams for system navigation)
 */
router.get('/', async (req, res, next) => {
  try {
    const userTeamIds = req.user!.memberships.map((m) => m.teamId);

    const teams = await prisma.team.findMany({
      include: {
        _count: {
          select: {
            workItems: true,
            memberships: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const enrichedTeams = teams.map((team) => {
      const membership = req.user!.memberships.find((m) => m.teamId === team.id);
      return {
        ...team,
        userRole: membership ? membership.role : null,
        isMember: Boolean(membership),
      };
    });

    return res.json({ teams: enrichedTeams });
  } catch (err) {
    next(err);
  }
});

/**
 * Get single team details and active member roster
 */
router.get('/:id', async (req, res, next) => {
  try {
    const teamId = req.params.id;
    assertTeamAccess(req.user!, teamId, 'VIEWER');

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        memberships: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        _count: {
          select: { workItems: true },
        },
      },
    });

    return res.json({ team });
  } catch (err) {
    next(err);
  }
});

export default router;
