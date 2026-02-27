const jwt = require('jsonwebtoken');
const { GameLoop } = require('../engine/GameLoop');

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
          characters: state.characters.map((c) => ({
            id: c.id, firstName: c.firstName, lastName: c.lastName,
            isAlive: c.isAlive, isPlayer: c.isPlayer,
            diplomacy: c.diplomacy, martial: c.martial,
            stewardship: c.stewardship, intrigue: c.intrigue,
            learning: c.learning, prowess: c.prowess,
            health: c.health, stress: c.stress, gold: c.gold,
            prestige: c.prestige, piety: c.piety,
            dynastyId: c.dynastyId, cultureId: c.cultureId, religionId: c.religionId,
          })),
          titles: state.titles.map((t) => ({
            id: t.id, key: t.key, name: t.name, tier: t.tier,
            color: t.color, holderId: t.holderId,
            mapX: t.mapX, mapY: t.mapY, terrain: t.terrain,
            deJureParentId: t.deJureParentId,
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
          wars: state.wars,
          armies: state.armies.map((a) => ({
            id: a.id, name: a.name, ownerId: a.ownerId,
            posX: a.posX, posY: a.posY, levies: a.levies,
            morale: a.morale, isRaised: a.isRaised,
          })),
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

    socket.on('build', async (data) => {
      const { holdingId, buildingKey } = data;
      if (!socket.sessionId) return;

      const state = gameLoop.sessions.get(socket.sessionId);
      if (!state) return;

      const holding = state.holdings.find((h) => h.id === holdingId);
      if (!holding) return;

      const char = state.characters.find((c) => c.id === socket.user.id); // simplified
      const result = gameLoop.economyEngine.startBuilding(holding, buildingKey, char?.gold || 0);

      if (result.success) {
        if (char) char.gold -= result.cost;
        socket.emit('build_started', { holdingId, buildingKey, cost: result.cost });
      } else {
        socket.emit('error', { message: result.error });
      }
    });

    socket.on('move_army', (data) => {
      const { armyId, targetX, targetY } = data;
      if (!socket.sessionId) return;

      const state = gameLoop.sessions.get(socket.sessionId);
      if (!state) return;

      const army = state.armies.find((a) => a.id === armyId);
      if (army) {
        army.targetX = targetX;
        army.targetY = targetY;
        io.to(`session_${socket.sessionId}`).emit('army_moving', {
          armyId, targetX, targetY,
        });
      }
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
