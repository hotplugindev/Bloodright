const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/dynasties?savegameId=X
router.get('/', authMiddleware, async (req, res) => {
  try {
    const savegameId = parseInt(req.query.savegameId);
    if (!savegameId) return res.status(400).json({ error: 'savegameId required' });

    const dynasties = await prisma.dynasty.findMany({
      where: { savegameId },
      include: {
        members: {
          select: {
            id: true, firstName: true, lastName: true, isAlive: true,
            isMale: true, birthDate: true, deathDate: true,
            fatherId: true, spouseId: true,
          },
          orderBy: { birthDate: 'asc' },
        },
      },
    });

    res.json({ dynasties });
  } catch (err) {
    console.error('Dynasties fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dynasties/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const dynasty = await prisma.dynasty.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        members: {
          include: {
            traits: true,
            heldTitles: { select: { id: true, name: true, tier: true } },
            children: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { birthDate: 'asc' },
        },
      },
    });

    if (!dynasty) return res.status(404).json({ error: 'Dynasty not found' });
    res.json({ dynasty });
  } catch (err) {
    console.error('Dynasty fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dynasties/:id/tree — family tree structure
router.get('/:id/tree', authMiddleware, async (req, res) => {
  try {
    const dynasty = await prisma.dynasty.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!dynasty) return res.status(404).json({ error: 'Dynasty not found' });

    const members = await prisma.character.findMany({
      where: { dynastyId: dynasty.id },
      select: {
        id: true, firstName: true, lastName: true, isMale: true,
        birthDate: true, deathDate: true, isAlive: true,
        fatherId: true, spouseId: true,
        heldTitles: { select: { name: true, tier: true } },
      },
      orderBy: { birthDate: 'asc' },
    });

    // Build tree structure
    const roots = members.filter((m) => !m.fatherId || !members.find((p) => p.id === m.fatherId));
    function buildNode(member) {
      return {
        ...member,
        children: members
          .filter((m) => m.fatherId === member.id)
          .map(buildNode),
      };
    }

    const tree = roots.map(buildNode);
    res.json({ dynasty, tree });
  } catch (err) {
    console.error('Dynasty tree error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/dynasties/:id/perks — unlock a dynasty perk
router.post('/:id/perks', authMiddleware, async (req, res) => {
  try {
    const { perkKey } = req.body;
    const dynasty = await prisma.dynasty.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!dynasty) return res.status(404).json({ error: 'Dynasty not found' });

    const currentPerks = (dynasty.perks || []);
    if (currentPerks.includes(perkKey)) {
      return res.status(400).json({ error: 'Perk already unlocked' });
    }

    // Cost: 500 renown per perk
    const cost = 500;
    if (dynasty.renown < cost) {
      return res.status(400).json({ error: 'Insufficient renown' });
    }

    const updated = await prisma.dynasty.update({
      where: { id: dynasty.id },
      data: {
        renown: dynasty.renown - cost,
        perks: [...currentPerks, perkKey],
      },
    });

    res.json({ dynasty: updated });
  } catch (err) {
    console.error('Dynasty perk error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
