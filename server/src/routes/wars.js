const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/wars — declare war
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { savegameId, attackerId, defenderId, casusBelli, targetTitle } = req.body;

    const war = await prisma.war.create({
      data: {
        savegameId,
        name: `War for ${targetTitle || 'supremacy'}`,
        casusBelli,
        attackerId,
        defenderId,
        targetTitle,
        warScore: 0,
        startDate: (await prisma.savegame.findUnique({ where: { id: savegameId } })).gameDate,
      },
    });

    // Add participants
    await prisma.warParticipant.createMany({
      data: [
        { warId: war.id, characterId: attackerId, side: 'attacker' },
        { warId: war.id, characterId: defenderId, side: 'defender' },
      ],
    });

    res.status(201).json({ war });
  } catch (err) {
    console.error('War declaration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/wars?savegameId=X
router.get('/', authMiddleware, async (req, res) => {
  try {
    const savegameId = parseInt(req.query.savegameId);
    if (!savegameId) return res.status(400).json({ error: 'savegameId required' });

    const wars = await prisma.war.findMany({
      where: { savegameId, endDate: null },
      include: {
        participants: {
          include: {
            // We only have characterId, find minimal info
          },
        },
      },
    });

    res.json({ wars });
  } catch (err) {
    console.error('Wars fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/wars/:id/peace — offer or enforce peace
router.post('/:id/peace', authMiddleware, async (req, res) => {
  try {
    const { result } = req.body; // attacker_victory | defender_victory | white_peace
    const war = await prisma.war.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!war) return res.status(404).json({ error: 'War not found' });

    const savegame = await prisma.savegame.findUnique({ where: { id: war.savegameId } });

    const updated = await prisma.war.update({
      where: { id: war.id },
      data: {
        result,
        endDate: savegame.gameDate,
      },
    });

    // Apply war results
    if (result === 'attacker_victory' && war.targetTitle) {
      // Transfer title
      const title = await prisma.title.findFirst({
        where: { savegameId: war.savegameId, key: war.targetTitle },
      });
      if (title) {
        await prisma.title.update({
          where: { id: title.id },
          data: { holderId: war.attackerId },
        });
      }
    }

    res.json({ war: updated });
  } catch (err) {
    console.error('Peace offer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/wars/:id/raise-army
router.post('/:id/raise-army', authMiddleware, async (req, res) => {
  try {
    const { characterId, name, posX, posY } = req.body;
    const war = await prisma.war.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!war) return res.status(404).json({ error: 'War not found' });

    // Calculate levies from holdings
    const titles = await prisma.title.findMany({
      where: { holderId: characterId, tier: 'barony' },
      include: { holdings: { include: { buildings: true } } },
    });

    let totalLevies = 0;
    for (const t of titles) {
      for (const h of t.holdings) {
        let base = Math.floor(h.development * 100);
        for (const b of h.buildings) {
          if (b.buildingKey === 'barracks') base += b.level * 150;
          if (b.buildingKey === 'farm_estate') base += b.level * 50;
        }
        totalLevies += base;
      }
    }

    const army = await prisma.army.create({
      data: {
        savegameId: war.savegameId,
        ownerId: characterId,
        commanderId: characterId,
        name: name || `Army of ${characterId}`,
        posX: posX || 0,
        posY: posY || 0,
        levies: totalLevies,
        isRaised: true,
      },
    });

    // Add default men-at-arms
    await prisma.menAtArms.createMany({
      data: [
        { armyId: army.id, type: 'pikemen', count: 50, maxCount: 50 },
        { armyId: army.id, type: 'archers', count: 30, maxCount: 30 },
      ],
    });

    res.status(201).json({ army });
  } catch (err) {
    console.error('Raise army error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
