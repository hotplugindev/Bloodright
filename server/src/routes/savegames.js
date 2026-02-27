const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/savegames — list user's savegames
router.get('/', authMiddleware, async (req, res) => {
  try {
    const savegames = await prisma.savegame.findMany({
      where: { userId: req.user.id },
      select: {
        id: true, name: true, gameDate: true, createdAt: true, updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ savegames });
  } catch (err) {
    console.error('Savegames list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/savegames — create manual save
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, sessionId } = req.body;

    // Get session's current savegame
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { savegame: true },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Update the savegame
    const updated = await prisma.savegame.update({
      where: { id: session.savegameId },
      data: {
        name: name || session.savegame.name,
        updatedAt: new Date(),
      },
    });

    res.json({ savegame: updated });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/savegames/:id/state — full game state for loading
router.get('/:id/state', authMiddleware, async (req, res) => {
  try {
    const savegameId = parseInt(req.params.id);

    const [savegame, characters, dynasties, titles, holdings, wars, religions, cultures] =
      await Promise.all([
        prisma.savegame.findUnique({ where: { id: savegameId } }),
        prisma.character.findMany({
          where: { savegameId },
          include: { traits: true },
        }),
        prisma.dynasty.findMany({ where: { savegameId } }),
        prisma.title.findMany({ where: { savegameId } }),
        prisma.holding.findMany({
          where: { savegameId },
          include: { buildings: true },
        }),
        prisma.war.findMany({
          where: { savegameId },
          include: { participants: true },
        }),
        prisma.religion.findMany({ where: { savegameId } }),
        prisma.culture.findMany({ where: { savegameId } }),
      ]);

    if (!savegame) return res.status(404).json({ error: 'Savegame not found' });

    res.json({
      savegame,
      characters,
      dynasties,
      titles,
      holdings,
      wars,
      religions,
      cultures,
    });
  } catch (err) {
    console.error('Game state load error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
