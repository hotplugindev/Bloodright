const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/titles?savegameId=X&tier=county
router.get('/', authMiddleware, async (req, res) => {
  try {
    const savegameId = parseInt(req.query.savegameId);
    if (!savegameId) return res.status(400).json({ error: 'savegameId required' });

    const where = { savegameId };
    if (req.query.tier) where.tier = req.query.tier;

    const titles = await prisma.title.findMany({
      where,
      include: {
        holder: { select: { id: true, firstName: true, lastName: true } },
        deJureParent: { select: { id: true, name: true, tier: true } },
        holdings: {
          include: { buildings: true },
        },
      },
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    });

    res.json({ titles });
  } catch (err) {
    console.error('Titles fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/titles/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const title = await prisma.title.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        holder: {
          select: {
            id: true, firstName: true, lastName: true,
            dynastyId: true, dynasty: { select: { name: true } },
          },
        },
        deJureParent: { select: { id: true, name: true, tier: true } },
        deJureChildren: {
          select: {
            id: true, name: true, tier: true, key: true,
            holder: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        vassals: {
          select: {
            id: true, name: true, tier: true,
            holder: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        claimants: {
          select: { id: true, firstName: true, lastName: true },
        },
        holdings: {
          include: { buildings: true },
        },
      },
    });

    if (!title) return res.status(404).json({ error: 'Title not found' });
    res.json({ title });
  } catch (err) {
    console.error('Title fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/titles/:id/laws — update succession/vassal laws
router.put('/:id/laws', authMiddleware, async (req, res) => {
  try {
    const { successionLaw, genderLaw, vassalTaxRate, vassalLevyRate } = req.body;
    const data = {};

    const validSuccession = ['primogeniture', 'partition', 'elective'];
    const validGender = ['male_preference', 'female_preference', 'equal'];

    if (successionLaw && validSuccession.includes(successionLaw)) {
      data.successionLaw = successionLaw;
    }
    if (genderLaw && validGender.includes(genderLaw)) {
      data.genderLaw = genderLaw;
    }
    if (vassalTaxRate !== undefined) {
      data.vassalTaxRate = Math.max(0, Math.min(1, parseFloat(vassalTaxRate)));
    }
    if (vassalLevyRate !== undefined) {
      data.vassalLevyRate = Math.max(0, Math.min(1, parseFloat(vassalLevyRate)));
    }

    const title = await prisma.title.update({
      where: { id: parseInt(req.params.id) },
      data,
    });

    res.json({ title });
  } catch (err) {
    console.error('Title law update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/titles/map/:savegameId — map data for rendering
router.get('/map/:savegameId', authMiddleware, async (req, res) => {
  try {
    const savegameId = parseInt(req.params.savegameId);
    const counties = await prisma.title.findMany({
      where: { savegameId, tier: 'county' },
      select: {
        id: true, key: true, name: true, color: true,
        mapX: true, mapY: true, terrain: true,
        holderId: true,
        holder: {
          select: {
            id: true, firstName: true, lastName: true,
            dynasty: { select: { name: true } },
          },
        },
        deJureParent: {
          select: {
            id: true, name: true, color: true,
            deJureParent: {
              select: { id: true, name: true, color: true },
            },
          },
        },
      },
    });

    res.json({ counties });
  } catch (err) {
    console.error('Map data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
