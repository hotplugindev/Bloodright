const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/characters?savegameId=X
router.get('/', authMiddleware, async (req, res) => {
  try {
    const savegameId = parseInt(req.query.savegameId);
    if (!savegameId) return res.status(400).json({ error: 'savegameId required' });

    const characters = await prisma.character.findMany({
      where: { savegameId, isAlive: true },
      include: {
        traits: true,
        dynasty: { select: { id: true, name: true } },
        culture: { select: { id: true, name: true, key: true } },
        religion: { select: { id: true, name: true, key: true } },
        heldTitles: { select: { id: true, name: true, tier: true, key: true } },
      },
      orderBy: { id: 'asc' },
    });

    res.json({ characters });
  } catch (err) {
    console.error('Characters fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/characters/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const character = await prisma.character.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        traits: true,
        dynasty: true,
        culture: true,
        religion: true,
        heldTitles: true,
        claims: true,
        children: {
          select: { id: true, firstName: true, lastName: true, isMale: true, birthDate: true, isAlive: true },
        },
        father: {
          select: { id: true, firstName: true, lastName: true },
        },
        spouse: {
          select: { id: true, firstName: true, lastName: true, isMale: true },
        },
        relationshipsFrom: {
          include: { to: { select: { id: true, firstName: true, lastName: true } } },
        },
        commandedArmies: {
          select: { id: true, name: true, levies: true },
        },
      },
    });

    if (!character) return res.status(404).json({ error: 'Character not found' });
    res.json({ character });
  } catch (err) {
    console.error('Character fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/characters/:id/lifestyle
router.post('/:id/lifestyle', authMiddleware, async (req, res) => {
  try {
    const { focus } = req.body;
    const validFocuses = ['diplomacy', 'martial', 'stewardship', 'intrigue', 'learning'];
    if (!validFocuses.includes(focus)) {
      return res.status(400).json({ error: 'Invalid lifestyle focus' });
    }

    const character = await prisma.character.update({
      where: { id: parseInt(req.params.id) },
      data: { lifestyleFocus: focus },
    });

    res.json({ character });
  } catch (err) {
    console.error('Lifestyle update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
