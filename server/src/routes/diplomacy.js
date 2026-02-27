const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/diplomacy/propose-marriage
router.post('/propose-marriage', authMiddleware, async (req, res) => {
  try {
    const { charId, targetCharId } = req.body;

    const char1 = await prisma.character.findUnique({ where: { id: charId } });
    const char2 = await prisma.character.findUnique({ where: { id: targetCharId } });

    if (!char1 || !char2) return res.status(404).json({ error: 'Character not found' });
    if (char1.spouseId || char2.spouseId) {
      return res.status(400).json({ error: 'One or both characters already married' });
    }

    // Update spouses
    await prisma.character.update({ where: { id: char1.id }, data: { spouseId: char2.id } });
    await prisma.character.update({ where: { id: char2.id }, data: { spouseId: char1.id } });

    // Create alliance if both are rulers
    const char1Titles = await prisma.title.findFirst({ where: { holderId: char1.id } });
    const char2Titles = await prisma.title.findFirst({ where: { holderId: char2.id } });

    if (char1Titles && char2Titles) {
      const savegameId = char1.savegameId || (await prisma.title.findFirst({ where: { holderId: char1.id } })).savegameId;
      const savegame = await prisma.savegame.findFirst({
        where: { id: savegameId },
      });

      await prisma.alliance.create({
        data: {
          savegameId: savegame ? savegame.id : char1Titles.savegameId,
          char1Id: char1.id,
          char2Id: char2.id,
          reason: 'marriage',
          startDate: savegame ? savegame.gameDate : 0,
        },
      });
    }

    res.json({ success: true, message: 'Marriage and alliance formed' });
  } catch (err) {
    console.error('Marriage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/diplomacy/opinions/:charId — opinion breakdown
router.get('/opinions/:charId', authMiddleware, async (req, res) => {
  try {
    const charId = parseInt(req.params.charId);
    const char = await prisma.character.findUnique({
      where: { id: charId },
      include: { traits: true },
    });
    if (!char) return res.status(404).json({ error: 'Character not found' });

    // Get all characters who have relationships with this character
    const relationships = await prisma.relationship.findMany({
      where: { OR: [{ fromId: charId }, { toId: charId }] },
      include: {
        from: { select: { id: true, firstName: true, lastName: true } },
        to: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Get vassals
    const heldTitles = await prisma.title.findMany({
      where: { holderId: charId },
      include: {
        vassals: {
          include: {
            holder: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    const vassalOpinions = [];
    for (const title of heldTitles) {
      for (const vassal of title.vassals) {
        if (vassal.holder) {
          const rel = relationships.find(
            (r) =>
              (r.fromId === vassal.holder.id && r.toId === charId) ||
              (r.toId === vassal.holder.id && r.fromId === charId)
          );
          vassalOpinions.push({
            character: vassal.holder,
            opinion: rel ? rel.opinion : 0,
            breakdown: {
              base: 0,
              relationship: rel ? rel.opinion : 0,
              vassalContract: Math.round(-title.vassalTaxRate * 50),
            },
          });
        }
      }
    }

    res.json({ relationships, vassalOpinions });
  } catch (err) {
    console.error('Opinions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/diplomacy/factions — create a faction
router.post('/factions', authMiddleware, async (req, res) => {
  try {
    const { savegameId, type, targetId, memberIds } = req.body;

    const faction = await prisma.faction.create({
      data: {
        savegameId,
        type,
        targetId,
        power: 0,
      },
    });

    if (memberIds && memberIds.length > 0) {
      await prisma.factionMember.createMany({
        data: memberIds.map((cid) => ({
          factionId: faction.id,
          characterId: cid,
        })),
      });
    }

    res.status(201).json({ faction });
  } catch (err) {
    console.error('Faction create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/diplomacy/schemes — start a scheme
router.post('/schemes', authMiddleware, async (req, res) => {
  try {
    const { savegameId, ownerId, targetId, type } = req.body;
    const validTypes = ['murder', 'seduce', 'fabricate_claim', 'abduct'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid scheme type' });
    }

    const owner = await prisma.character.findUnique({
      where: { id: ownerId },
      include: { traits: true },
    });

    // Base power from intrigue stat
    const basePower = owner ? owner.intrigue * 5 : 25;

    const scheme = await prisma.scheme.create({
      data: {
        savegameId,
        ownerId,
        targetId,
        type,
        power: basePower,
        secrecy: 100,
        progress: 0,
      },
    });

    res.status(201).json({ scheme });
  } catch (err) {
    console.error('Scheme create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
