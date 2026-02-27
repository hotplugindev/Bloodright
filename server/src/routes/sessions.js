const express = require('express');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// POST /api/sessions — create a new game session
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { savegameId, name } = req.body;
    let saveId = savegameId;

    // If no savegame specified, create new from template
    if (!saveId) {
      const templateSave = await prisma.savegame.findFirst({
        where: { name: 'New Game Template' },
      });

      // Create a new savegame as a copy
      const newSave = await prisma.savegame.create({
        data: {
          name: name || `Game ${Date.now()}`,
          userId: req.user.id,
          gameDate: templateSave ? templateSave.gameDate : 0,
        },
      });
      saveId = newSave.id;

      // Copy game entities from template if template exists
      if (templateSave) {
        // Copy all game entities from template
        await copyGameState(templateSave.id, newSave.id);
      }
    }

    const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    const session = await prisma.gameSession.create({
      data: {
        inviteCode,
        savegameId: saveId,
        hostUserId: req.user.id,
        status: 'lobby',
      },
    });

    // Add host as a session user
    await prisma.sessionUser.create({
      data: {
        sessionId: session.id,
        userId: req.user.id,
      },
    });

    res.status(201).json({ session });
  } catch (err) {
    console.error('Session create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sessions/join — join session by invite code
router.post('/join', authMiddleware, async (req, res) => {
  try {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ error: 'Invite code required' });

    const session = await prisma.gameSession.findUnique({
      where: { inviteCode: inviteCode.toUpperCase() },
      include: { users: true },
    });

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status !== 'lobby') return res.status(400).json({ error: 'Session already in progress' });

    // Check if already joined
    const existing = session.users.find((u) => u.userId === req.user.id);
    if (existing) return res.json({ session, message: 'Already in session' });

    await prisma.sessionUser.create({
      data: {
        sessionId: session.id,
        userId: req.user.id,
      },
    });

    const updated = await prisma.gameSession.findUnique({
      where: { id: session.id },
      include: {
        users: { include: { user: { select: { id: true, username: true } } } },
        savegame: { select: { id: true, name: true, gameDate: true } },
      },
    });

    res.json({ session: updated });
  } catch (err) {
    console.error('Session join error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sessions — list user's sessions
router.get('/', authMiddleware, async (req, res) => {
  try {
    const sessions = await prisma.gameSession.findMany({
      where: {
        users: { some: { userId: req.user.id } },
      },
      include: {
        users: { include: { user: { select: { id: true, username: true } } } },
        savegame: { select: { id: true, name: true, gameDate: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ sessions });
  } catch (err) {
    console.error('Sessions list error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/sessions/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const session = await prisma.gameSession.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        users: { include: { user: { select: { id: true, username: true } } } },
        savegame: { select: { id: true, name: true, gameDate: true } },
      },
    });

    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  } catch (err) {
    console.error('Session fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/sessions/:id/select-ruler — select a character to play as
router.post('/:id/select-ruler', authMiddleware, async (req, res) => {
  try {
    const { characterId } = req.body;
    const sessionId = parseInt(req.params.id);

    const sessionUser = await prisma.sessionUser.findFirst({
      where: { sessionId, userId: req.user.id },
    });
    if (!sessionUser) return res.status(403).json({ error: 'Not in this session' });

    // Mark character as player-controlled
    await prisma.character.update({
      where: { id: characterId },
      data: { isPlayer: true },
    });

    await prisma.sessionUser.update({
      where: { id: sessionUser.id },
      data: { characterId, isReady: true },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Select ruler error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: copy all game state from one savegame to another
async function copyGameState(fromSaveId, toSaveId) {
  // Copy religions
  const religions = await prisma.religion.findMany({ where: { savegameId: fromSaveId } });
  for (const r of religions) {
    await prisma.religion.create({
      data: {
        savegameId: toSaveId, key: r.key, name: r.name, familyKey: r.familyKey,
        fervor: r.fervor, doctrines: r.doctrines, tenets: r.tenets, hostility: r.hostility,
      },
    });
  }

  // Copy cultures
  const cultures = await prisma.culture.findMany({ where: { savegameId: fromSaveId } });
  for (const c of cultures) {
    await prisma.culture.create({
      data: {
        savegameId: toSaveId, key: c.key, name: c.name, groupKey: c.groupKey,
        ethos: c.ethos, traditions: c.traditions, innovations: c.innovations,
        innovationProgress: c.innovationProgress, bonuses: c.bonuses,
      },
    });
  }

  // Copy dynasties
  const dynasties = await prisma.dynasty.findMany({ where: { savegameId: fromSaveId } });
  const dynastyIdMap = {};
  for (const d of dynasties) {
    const newD = await prisma.dynasty.create({
      data: {
        savegameId: toSaveId, name: d.name, motto: d.motto,
        renown: d.renown, perks: d.perks,
      },
    });
    dynastyIdMap[d.id] = newD.id;
  }

  // Get new culture/religion IDs by key
  const newReligions = await prisma.religion.findMany({ where: { savegameId: toSaveId } });
  const newCultures = await prisma.culture.findMany({ where: { savegameId: toSaveId } });
  const oldReligions = await prisma.religion.findMany({ where: { savegameId: fromSaveId } });
  const oldCultures = await prisma.culture.findMany({ where: { savegameId: fromSaveId } });

  const relMap = {};
  oldReligions.forEach((or) => {
    const nr = newReligions.find((r) => r.key === or.key);
    if (nr) relMap[or.id] = nr.id;
  });

  const culMap = {};
  oldCultures.forEach((oc) => {
    const nc = newCultures.find((c) => c.key === oc.key);
    if (nc) culMap[oc.id] = nc.id;
  });

  // Copy characters
  const characters = await prisma.character.findMany({
    where: { savegameId: fromSaveId },
    include: { traits: true },
  });
  const charIdMap = {};
  for (const ch of characters) {
    const newCh = await prisma.character.create({
      data: {
        savegameId: toSaveId, firstName: ch.firstName, lastName: ch.lastName,
        isMale: ch.isMale, birthDate: ch.birthDate, deathDate: ch.deathDate,
        isAlive: ch.isAlive, isPlayer: false,
        diplomacy: ch.diplomacy, martial: ch.martial, stewardship: ch.stewardship,
        intrigue: ch.intrigue, learning: ch.learning, prowess: ch.prowess,
        health: ch.health, fertility: ch.fertility, stress: ch.stress,
        piety: ch.piety, prestige: ch.prestige, gold: ch.gold,
        geneticTraits: ch.geneticTraits,
        lifestyleFocus: ch.lifestyleFocus, lifestyleXp: ch.lifestyleXp,
        lifestylePerks: ch.lifestylePerks,
        dynastyId: ch.dynastyId ? dynastyIdMap[ch.dynastyId] : null,
        cultureId: ch.cultureId ? culMap[ch.cultureId] : null,
        religionId: ch.religionId ? relMap[ch.religionId] : null,
      },
    });
    charIdMap[ch.id] = newCh.id;

    // Copy traits
    if (ch.traits.length > 0) {
      await prisma.characterTrait.createMany({
        data: ch.traits.map((t) => ({ characterId: newCh.id, traitKey: t.traitKey })),
      });
    }
  }

  // Update father/spouse references
  for (const ch of characters) {
    const updates = {};
    if (ch.fatherId && charIdMap[ch.fatherId]) updates.fatherId = charIdMap[ch.fatherId];
    if (ch.spouseId && charIdMap[ch.spouseId]) updates.spouseId = charIdMap[ch.spouseId];
    if (Object.keys(updates).length > 0) {
      await prisma.character.update({
        where: { id: charIdMap[ch.id] },
        data: updates,
      });
    }
  }

  // Update dynasty heads
  for (const d of dynasties) {
    if (d.headId && charIdMap[d.headId]) {
      await prisma.dynasty.update({
        where: { id: dynastyIdMap[d.id] },
        data: { headId: charIdMap[d.headId] },
      });
    }
  }

  // Copy titles
  const titles = await prisma.title.findMany({ where: { savegameId: fromSaveId } });
  const titleIdMap = {};

  // First pass: create titles without parent references
  for (const t of titles) {
    const newT = await prisma.title.create({
      data: {
        savegameId: toSaveId, key: t.key, name: t.name, tier: t.tier, color: t.color,
        holderId: t.holderId ? charIdMap[t.holderId] : null,
        successionLaw: t.successionLaw, genderLaw: t.genderLaw,
        vassalTaxRate: t.vassalTaxRate, vassalLevyRate: t.vassalLevyRate,
        mapX: t.mapX, mapY: t.mapY, terrain: t.terrain,
      },
    });
    titleIdMap[t.id] = newT.id;
  }

  // Second pass: set parent references
  for (const t of titles) {
    const updates = {};
    if (t.deJureParentId && titleIdMap[t.deJureParentId]) {
      updates.deJureParentId = titleIdMap[t.deJureParentId];
    }
    if (t.liegeId && titleIdMap[t.liegeId]) {
      updates.liegeId = titleIdMap[t.liegeId];
    }
    if (Object.keys(updates).length > 0) {
      await prisma.title.update({
        where: { id: titleIdMap[t.id] },
        data: updates,
      });
    }
  }

  // Copy holdings
  const holdings = await prisma.holding.findMany({
    where: { savegameId: fromSaveId },
    include: { buildings: true },
  });
  for (const h of holdings) {
    const newH = await prisma.holding.create({
      data: {
        savegameId: toSaveId,
        titleId: titleIdMap[h.titleId],
        type: h.type,
        development: h.development,
      },
    });
    if (h.buildings.length > 0) {
      await prisma.building.createMany({
        data: h.buildings.map((b) => ({
          holdingId: newH.id,
          buildingKey: b.buildingKey,
          level: b.level,
          isBuilding: b.isBuilding,
          buildDays: b.buildDays,
        })),
      });
    }
  }
}

module.exports = router;
