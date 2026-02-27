const jwt = require('jsonwebtoken');
const { GameLoop } = require('../engine/GameLoop');
const focusesData = require('../data/focuses.json');

/**
 * SocketManager — Manages Socket.IO connections, session rooms,
 * player join/leave, game commands, and reconnection handling.
 */
function setupSocketManager(io, prisma) {
  const gameLoop = new GameLoop(prisma);

  // Authentication middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Player connected: ${socket.user.username} (${socket.id})`);

    // ─── Join Session ───
    socket.on('join_session', async (data) => {
      const { sessionId } = data;
      try {
        const session = await prisma.gameSession.findUnique({
          where: { id: sessionId },
          include: { users: { include: { user: { select: { id: true, username: true } } } } },
        });

        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        // Verify user is part of this session
        const isParticipant = session.users.some((u) => u.userId === socket.user.id);
        if (!isParticipant) {
          socket.emit('error', { message: 'Not a participant of this session' });
          return;
        }

        // Join the Socket.IO room
        socket.join(`session_${sessionId}`);
        socket.sessionId = sessionId;

        // Initialize game state if not already loaded
        if (!gameLoop.sessions.has(sessionId)) {
          await gameLoop.initSession(sessionId, session.savegameId);
        }

        const state = gameLoop.sessions.get(sessionId);

        // Restore character selections for all players in session
        for (const su of session.users) {
          if (su.characterId) {
            const char = state.characters.find((c) => c.id === su.characterId);
            if (char) char.isPlayer = true;
          }
        }

        // Find current user's previously selected character
        const currentSessionUser = session.users.find((u) => u.userId === socket.user.id);
        const myCharacterId = currentSessionUser?.characterId || null;

        // Notify all players
        io.to(`session_${sessionId}`).emit('player_joined', {
          username: socket.user.username,
          userId: socket.user.id,
          players: session.users.map((u) => ({
            userId: u.user.id,
            username: u.user.username,
            characterId: u.characterId,
            isReady: u.isReady,
          })),
        });

        // Send initial game state to the joining player
        socket.emit('game_state', {
          gameDate: state.gameDate,
          playerCharacterId: myCharacterId,
          characters: state.characters.map((c) => ({
            id: c.id, firstName: c.firstName, lastName: c.lastName,
            isAlive: c.isAlive, isPlayer: c.isPlayer,
            isMale: c.isMale, birthDate: c.birthDate,
            diplomacy: c.diplomacy, martial: c.martial,
            stewardship: c.stewardship, intrigue: c.intrigue,
            learning: c.learning, prowess: c.prowess,
            health: c.health, stress: c.stress, gold: c.gold,
            prestige: c.prestige, piety: c.piety, fertility: c.fertility,
            dynastyId: c.dynastyId, cultureId: c.cultureId, religionId: c.religionId,
            fatherId: c.fatherId, spouseId: c.spouseId,
            traits: (c.traits || []).map((t) => t.traitKey || t),
            lifestyleFocus: c.lifestyleFocus,
            rulerFocus: c.rulerFocus,
          })),
          titles: state.titles.map((t) => ({
            id: t.id, key: t.key, name: t.name, tier: t.tier,
            color: t.color, holderId: t.holderId,
            mapX: t.mapX, mapY: t.mapY, terrain: t.terrain,
            deJureParentId: t.deJureParentId,
            liegeId: t.liegeId,
            successionLaw: t.successionLaw,
            genderLaw: t.genderLaw,
            vassalTaxRate: t.vassalTaxRate,
            vassalLevyRate: t.vassalLevyRate,
          })),
          dynasties: state.dynasties.map((d) => ({
            id: d.id, name: d.name, headId: d.headId, renown: d.renown,
          })),
          religions: state.religions.map((r) => ({
            id: r.id, key: r.key, name: r.name, fervor: r.fervor,
          })),
          cultures: state.cultures.map((c) => ({
            id: c.id, key: c.key, name: c.name, innovations: c.innovations,
          })),
          wars: state.wars.map((w) => ({
            id: w.id, name: w.name, casusBelli: w.casusBelli,
            attackerId: w.attackerId, defenderId: w.defenderId,
            targetTitle: w.targetTitle, warScore: w.warScore,
            startDate: w.startDate, endDate: w.endDate, result: w.result,
          })),
          armies: state.armies.map((a) => ({
            id: a.id, name: a.name, ownerId: a.ownerId,
            commanderId: a.commanderId,
            posX: a.posX, posY: a.posY, levies: a.levies,
            morale: a.morale, isRaised: a.isRaised,
            isMoving: a.isMoving || false,
            isSieging: a.isSieging || false,
            siegeProgress: a.siegeProgress || 0,
            targetCountyId: a.targetCountyId || null,
            targetX: a.targetX, targetY: a.targetY,
            menAtArms: (a.menAtArms || []).map((m) => ({
              type: m.type, count: m.count, maxCount: m.maxCount,
            })),
          })),
          holdings: state.holdings.map((h) => ({
            id: h.id, titleId: h.titleId, type: h.type,
            development: h.development,
            buildings: (h.buildings || []).map((b) => ({
              id: b.id, buildingKey: b.buildingKey, level: b.level,
              isBuilding: b.isBuilding, buildDays: b.buildDays,
            })),
          })),
          schemes: (state.schemes || []).map((s) => ({
            id: s.id, ownerId: s.ownerId, targetId: s.targetId,
            type: s.type, power: s.power, secrecy: s.secrecy,
            progress: s.progress, isActive: s.isActive,
          })),
          populations: (state.populations || []).filter((p) => p.isAlive).map((p) => ({
            id: p.id, countyId: p.countyId, firstName: p.firstName, lastName: p.lastName,
            isMale: p.isMale, isAlive: p.isAlive,
            martial: p.martial, stewardship: p.stewardship, intrigue: p.intrigue,
            learning: p.learning, prowess: p.prowess, health: p.health,
            fertility: p.fertility, traits: p.traits,
            role: p.role, spouseId: p.spouseId, spouseType: p.spouseType,
            birthDate: p.birthDate,
          })),
          focuses: focusesData,
        });
      } catch (err) {
        console.error('Join session error:', err);
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    // ─── Game Controls ───
    socket.on('start_game', async () => {
      if (socket.sessionId) {
        gameLoop.startTickLoop(socket.sessionId, io);
        io.to(`session_${socket.sessionId}`).emit('game_started', {
          gameDate: gameLoop.sessions.get(socket.sessionId)?.gameDate,
        });
      }
    });

    socket.on('pause_game', () => {
      if (socket.sessionId) {
        gameLoop.pauseTickLoop(socket.sessionId);
        io.to(`session_${socket.sessionId}`).emit('game_paused');
      }
    });

    socket.on('resume_game', () => {
      if (socket.sessionId) {
        gameLoop.startTickLoop(socket.sessionId, io);
        io.to(`session_${socket.sessionId}`).emit('game_resumed');
      }
    });

    socket.on('set_speed', (data) => {
      if (socket.sessionId) {
        gameLoop.setTickSpeed(socket.sessionId, data.speed);
        io.to(`session_${socket.sessionId}`).emit('speed_changed', { speed: data.speed });
      }
    });

    // ─── Player Actions ───
    socket.on('event_choice', (data) => {
      const { characterId, eventKey, optionIndex } = data;
      if (!socket.sessionId) return;

      const result = gameLoop.handleEventChoice(socket.sessionId, characterId, eventKey, optionIndex);
      if (result) {
        socket.emit('event_resolved', { eventKey, results: result.results });

        // If no more pending events, resume ticking
        if (result.remainingEvents === 0) {
          io.to(`session_${socket.sessionId}`).emit('events_cleared');
        }
      }
    });

    socket.on('select_character', async (data) => {
      const { characterId } = data;
      if (!socket.sessionId) return;

      try {
        const sessionUser = await prisma.sessionUser.findFirst({
          where: { sessionId: socket.sessionId, userId: socket.user.id },
        });
        if (sessionUser) {
          await prisma.sessionUser.update({
            where: { id: sessionUser.id },
            data: { characterId, isReady: true },
          });

          // Mark character as player-controlled in game state
          const state = gameLoop.sessions.get(socket.sessionId);
          if (state) {
            const char = state.characters.find((c) => c.id === characterId);
            if (char) char.isPlayer = true;
          }

          io.to(`session_${socket.sessionId}`).emit('player_selected_character', {
            userId: socket.user.id,
            username: socket.user.username,
            characterId,
          });
        }
      } catch (err) {
        console.error('Select character error:', err);
      }
    });

    socket.on('construct_building', async (data) => {
      const { holdingId, buildingKey } = data;
      if (!socket.sessionId) return;

      const state = gameLoop.sessions.get(socket.sessionId);
      if (!state) return;

      // Find the player's character
      const sessionUser = await prisma.sessionUser.findFirst({
        where: { sessionId: socket.sessionId, userId: socket.user.id },
      });
      if (!sessionUser?.characterId) {
        socket.emit('error', { message: 'No character selected' });
        return;
      }

      const char = state.characters.find((c) => c.id === sessionUser.characterId);
      if (!char) return;

      const holding = state.holdings.find((h) => h.id === holdingId);
      if (!holding) {
        socket.emit('error', { message: 'Holding not found' });
        return;
      }

      // Verify ownership
      const holdingTitle = state.titles.find((t) => t.id === holding.titleId);
      if (!holdingTitle || holdingTitle.holderId !== char.id) {
        socket.emit('error', { message: 'You do not own this holding' });
        return;
      }

      const result = gameLoop.economyEngine.startBuilding(holding, buildingKey, char.gold);
      if (result.success) {
        char.gold -= result.cost;
        if (result.newBuilding) {
          holding.buildings = holding.buildings || [];
          holding.buildings.push({ id: Date.now(), ...result.newBuilding });
        } else if (result.upgrade) {
          const existing = holding.buildings.find((b) => b.id === result.upgrade.buildingId);
          if (existing) {
            existing.level = result.upgrade.level;
            existing.isBuilding = true;
            existing.buildDays = result.upgrade.buildDays;
          }
        }
        io.to(`session_${socket.sessionId}`).emit('building_started', {
          holdingId, buildingKey, cost: result.cost,
          characterId: char.id, goldRemaining: char.gold,
          building: result.newBuilding || result.upgrade,
        });
      } else {
        socket.emit('error', { message: result.error });
      }
    });

    socket.on('move_army', async (data) => {
      const { armyId, targetX, targetY, targetCountyId } = data;
      if (!socket.sessionId) return;

      const state = gameLoop.sessions.get(socket.sessionId);
      if (!state) return;

      const sessionUser = await prisma.sessionUser.findFirst({
        where: { sessionId: socket.sessionId, userId: socket.user.id },
      });
      if (!sessionUser?.characterId) return;

      const army = state.armies.find((a) => a.id === armyId && a.ownerId === sessionUser.characterId);
      if (!army || !army.isRaised) {
        socket.emit('error', { message: 'Cannot move this army' });
        return;
      }

      // Set target from county if provided
      if (targetCountyId) {
        const county = state.titles.find((t) => t.id === targetCountyId && t.tier === 'county');
        if (county) {
          army.targetX = county.mapX;
          army.targetY = county.mapY;
          army.targetCountyId = targetCountyId;
        }
      } else {
        army.targetX = targetX;
        army.targetY = targetY;
        army.targetCountyId = null;
      }
      army.isMoving = true;
      army.isSieging = false;
      army.siegeProgress = 0;

      io.to(`session_${socket.sessionId}`).emit('army_moving', {
        armyId: army.id, targetX: army.targetX, targetY: army.targetY,
        targetCountyId: army.targetCountyId, isMoving: true,
      });
    });

    // ─── Set Ruler Focus ───
    socket.on('set_ruler_focus', async (data) => {
      const { focusKey } = data;
      if (!socket.sessionId) return;

      const state = gameLoop.sessions.get(socket.sessionId);
      if (!state) return;

      const sessionUser = await prisma.sessionUser.findFirst({
        where: { sessionId: socket.sessionId, userId: socket.user.id },
      });
      if (!sessionUser?.characterId) return;

      const char = state.characters.find((c) => c.id === sessionUser.characterId);
      if (!char) return;

      const focus = focusesData[focusKey];
      if (!focus) {
        socket.emit('error', { message: 'Unknown focus' });
        return;
      }

      if (char.gold < focus.cost) {
        socket.emit('error', { message: `Need ${focus.cost} gold to change focus` });
        return;
      }

      char.gold -= focus.cost;
      char.rulerFocus = focusKey;

      io.to(`session_${socket.sessionId}`).emit('focus_changed', {
        characterId: char.id, focusKey, goldRemaining: char.gold,
      });
    });

    // ─── Assign Population Role ───
    socket.on('assign_role', async (data) => {
      const { populationId, role } = data;
      if (!socket.sessionId) return;

      const state = gameLoop.sessions.get(socket.sessionId);
      if (!state) return;

      const sessionUser = await prisma.sessionUser.findFirst({
        where: { sessionId: socket.sessionId, userId: socket.user.id },
      });
      if (!sessionUser?.characterId) return;

      const validRoles = ['marshal', 'steward', 'spymaster', 'chancellor', 'court_physician', 'knight', null];
      if (!validRoles.includes(role)) {
        socket.emit('error', { message: 'Invalid role' });
        return;
      }

      // Verify population belongs to a county held by the player
      const pop = state.populations.find((p) => p.id === populationId && p.isAlive);
      if (!pop) {
        socket.emit('error', { message: 'Population member not found' });
        return;
      }

      const playerCounties = state.titles
        .filter((t) => t.holderId === sessionUser.characterId && t.tier === 'county')
        .map((t) => t.id);

      if (!playerCounties.includes(pop.countyId)) {
        socket.emit('error', { message: 'Not your population' });
        return;
      }

      // Remove role from any other pop with same role in same realm
      if (role) {
        for (const p of state.populations) {
          if (p.role === role && playerCounties.includes(p.countyId)) {
            p.role = null;
          }
        }
      }

      pop.role = role;
      io.to(`session_${socket.sessionId}`).emit('role_assigned', {
        populationId, role, countyId: pop.countyId,
      });
    });

    // ─── Marry Population Member (Ruler marries inhabitant) ───
    socket.on('marry_population', async (data) => {
      const { populationId } = data;
      if (!socket.sessionId) return;

      const state = gameLoop.sessions.get(socket.sessionId);
      if (!state) return;

      const sessionUser = await prisma.sessionUser.findFirst({
        where: { sessionId: socket.sessionId, userId: socket.user.id },
      });
      if (!sessionUser?.characterId) return;

      const char = state.characters.find((c) => c.id === sessionUser.characterId);
      if (!char || char.spouseId) {
        socket.emit('error', { message: 'Already married or character not found' });
        return;
      }

      const pop = state.populations.find((p) => p.id === populationId && p.isAlive);
      if (!pop) {
        socket.emit('error', { message: 'Population member not found' });
        return;
      }

      if (pop.spouseId) {
        socket.emit('error', { message: 'Already married' });
        return;
      }

      // Check opposite gender
      if (pop.isMale === char.isMale) {
        socket.emit('error', { message: 'Must be opposite gender' });
        return;
      }

      pop.spouseId = char.id;
      pop.spouseType = 'character';

      io.to(`session_${socket.sessionId}`).emit('ruler_married_population', {
        characterId: char.id, populationId: pop.id,
        populationName: `${pop.firstName} ${pop.lastName}`,
      });
    });

    socket.on('save_game', async () => {
      if (!socket.sessionId) return;
      const state = gameLoop.sessions.get(socket.sessionId);
      if (state) {
        await gameLoop.saveGameState(state);
        socket.emit('game_saved', { gameDate: state.gameDate });
      }
    });

    // ─── Chat ───
    socket.on('chat_message', (data) => {
      if (socket.sessionId) {
        io.to(`session_${socket.sessionId}`).emit('chat_message', {
          username: socket.user.username,
          message: data.message,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // ─── Declare War ───
    socket.on('declare_war', async (data) => {
      const { targetCharacterId, casusBelli, targetTitleKey } = data;
      if (!socket.sessionId) return;
      const state = gameLoop.sessions.get(socket.sessionId);
      if (!state) return;
      const sessionUser = await prisma.sessionUser.findFirst({
        where: { sessionId: socket.sessionId, userId: socket.user.id },
      });
      if (!sessionUser?.characterId) return;
      const attacker = state.characters.find((c) => c.id === sessionUser.characterId);
      const defender = state.characters.find((c) => c.id === targetCharacterId);
      if (!attacker || !defender || !attacker.isAlive || !defender.isAlive) {
        socket.emit('error', { message: 'Invalid war declaration' });
        return;
      }
      const existingWar = state.wars.find((w) =>
        !w.endDate && ((w.attackerId === attacker.id && w.defenderId === defender.id) ||
        (w.attackerId === defender.id && w.defenderId === attacker.id)));
      if (existingWar) {
        socket.emit('error', { message: 'Already at war with this ruler' });
        return;
      }
      const war = {
        id: Date.now(), savegameId: state.savegameId,
        name: `${attacker.firstName}'s ${(casusBelli || 'conquest').replace(/_/g, ' ')} against ${defender.firstName}`,
        casusBelli: casusBelli || 'conquest',
        attackerId: attacker.id, defenderId: defender.id,
        targetTitle: targetTitleKey || null,
        warScore: 0, startDate: state.gameDate, endDate: null, result: null,
        participants: [],
      };
      state.wars.push(war);
      attacker.prestige -= 50;
      io.to(`session_${socket.sessionId}`).emit('war_declared', { war });
    });

    // ─── Propose Marriage ───
    socket.on('propose_marriage', async (data) => {
      const { targetCharacterId } = data;
      if (!socket.sessionId) return;
      const state = gameLoop.sessions.get(socket.sessionId);
      if (!state) return;
      const sessionUser = await prisma.sessionUser.findFirst({
        where: { sessionId: socket.sessionId, userId: socket.user.id },
      });
      if (!sessionUser?.characterId) return;
      const proposer = state.characters.find((c) => c.id === sessionUser.characterId);
      const target = state.characters.find((c) => c.id === targetCharacterId);
      if (!proposer || !target) return;
      if (proposer.spouseId || target.spouseId) {
        socket.emit('error', { message: 'One party is already married' });
        return;
      }
      const proposerTitles = state.titles.filter((t) => t.holderId === proposer.id);
      const targetTitles = state.titles.filter((t) => t.holderId === target.id);
      const evaluation = gameLoop.diplomacyEngine.evaluateMarriageProposal(proposer, target, proposerTitles, targetTitles);
      if (evaluation.accepted) {
        proposer.spouseId = target.id;
        target.spouseId = proposer.id;
        io.to(`session_${socket.sessionId}`).emit('marriage_accepted', {
          char1Id: proposer.id, char2Id: target.id,
        });
      } else {
        socket.emit('marriage_rejected', {
          proposerId: proposer.id, targetId: target.id, reason: 'Proposal rejected',
        });
      }
    });

    // ─── Start Scheme ───
    socket.on('start_scheme', async (data) => {
      const { targetCharacterId, schemeType } = data;
      if (!socket.sessionId) return;
      const state = gameLoop.sessions.get(socket.sessionId);
      if (!state) return;
      const sessionUser = await prisma.sessionUser.findFirst({
        where: { sessionId: socket.sessionId, userId: socket.user.id },
      });
      if (!sessionUser?.characterId) return;
      const owner = state.characters.find((c) => c.id === sessionUser.characterId);
      const target = state.characters.find((c) => c.id === targetCharacterId);
      if (!owner || !target || !owner.isAlive || !target.isAlive) return;
      const validTypes = ['murder', 'seduce', 'fabricate_claim', 'abduct'];
      if (!validTypes.includes(schemeType)) {
        socket.emit('error', { message: 'Invalid scheme type' });
        return;
      }
      state.schemes = state.schemes || [];
      const existing = state.schemes.find((s) => s.ownerId === owner.id && s.targetId === target.id && s.isActive);
      if (existing) {
        socket.emit('error', { message: 'Already have an active scheme against this character' });
        return;
      }
      const scheme = {
        id: Date.now(), savegameId: state.savegameId,
        ownerId: owner.id, targetId: target.id,
        type: schemeType,
        power: gameLoop.intrigueEngine.calculateSchemePower(owner),
        secrecy: Math.min(100, 60 + owner.intrigue * 2),
        progress: 0, isActive: true,
      };
      state.schemes.push(scheme);
      socket.emit('scheme_started', { scheme });
    });

    // ─── Raise Army ───
    socket.on('raise_army', async () => {
      if (!socket.sessionId) return;
      const state = gameLoop.sessions.get(socket.sessionId);
      if (!state) return;
      const sessionUser = await prisma.sessionUser.findFirst({
        where: { sessionId: socket.sessionId, userId: socket.user.id },
      });
      if (!sessionUser?.characterId) return;
      const char = state.characters.find((c) => c.id === sessionUser.characterId);
      if (!char) return;
      let army = state.armies.find((a) => a.ownerId === char.id);
      if (army && army.isRaised) {
        socket.emit('error', { message: 'Army already raised' });
        return;
      }
      const capital = state.titles.find((t) => t.holderId === char.id && t.tier === 'county' && t.mapX);
      if (army) {
        army.isRaised = true;
        army.levies = gameLoop.economyEngine.calculateLevies(char.id, state.titles, state.holdings);
        army.morale = 1.0;
        army.isMoving = false;
        army.isSieging = false;
        army.siegeProgress = 0;
        if (capital) { army.posX = capital.mapX; army.posY = capital.mapY; }
      } else {
        const levies = gameLoop.economyEngine.calculateLevies(char.id, state.titles, state.holdings);
        army = {
          id: Date.now(), savegameId: state.savegameId, ownerId: char.id,
          commanderId: char.id, name: `${char.firstName}'s Host`,
          posX: capital?.mapX || 400, posY: capital?.mapY || 300,
          levies: Math.max(100, levies), morale: 1.0, isRaised: true,
          isMoving: false, isSieging: false, siegeProgress: 0,
          targetCountyId: null, targetX: null, targetY: null,
          menAtArms: [],
        };
        state.armies.push(army);
      }
      io.to(`session_${socket.sessionId}`).emit('army_update', {
        army: { id: army.id, name: army.name, ownerId: army.ownerId,
          posX: army.posX, posY: army.posY, levies: army.levies,
          morale: army.morale, isRaised: army.isRaised,
          isMoving: army.isMoving || false, isSieging: army.isSieging || false,
          siegeProgress: army.siegeProgress || 0,
          menAtArms: army.menAtArms || [] },
      });
    });

    // ─── Disband Army ───
    socket.on('disband_army', async () => {
      if (!socket.sessionId) return;
      const state = gameLoop.sessions.get(socket.sessionId);
      if (!state) return;
      const sessionUser = await prisma.sessionUser.findFirst({
        where: { sessionId: socket.sessionId, userId: socket.user.id },
      });
      if (!sessionUser?.characterId) return;
      const army = state.armies.find((a) => a.ownerId === sessionUser.characterId && a.isRaised);
      if (army) {
        army.isRaised = false;
        army.isMoving = false;
        army.isSieging = false;
        army.siegeProgress = 0;
        io.to(`session_${socket.sessionId}`).emit('army_update', {
          army: { id: army.id, name: army.name, ownerId: army.ownerId,
            posX: army.posX, posY: army.posY, levies: army.levies,
            morale: army.morale, isRaised: false,
            isMoving: false, isSieging: false, siegeProgress: 0,
            menAtArms: army.menAtArms || [] },
        });
      }
    });

    // ─── Disconnect ───
    socket.on('disconnect', () => {
      console.log(`🔌 Player disconnected: ${socket.user.username}`);
      if (socket.sessionId) {
        io.to(`session_${socket.sessionId}`).emit('player_left', {
          username: socket.user.username,
          userId: socket.user.id,
        });

        // Check if all players left
        const room = io.sockets.adapter.rooms.get(`session_${socket.sessionId}`);
        if (!room || room.size === 0) {
          // Pause and save
          gameLoop.pauseTickLoop(socket.sessionId);
          const state = gameLoop.sessions.get(socket.sessionId);
          if (state) {
            gameLoop.saveGameState(state).then(() => {
              gameLoop.destroySession(socket.sessionId);
            });
          }
        }
      }
    });
  });

  return gameLoop;
}

module.exports = { setupSocketManager };
