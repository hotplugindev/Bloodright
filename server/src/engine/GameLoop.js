const { EventQueue } = require('./EventQueue');
const { CharacterEngine } = require('./CharacterEngine');
const { DynastyEngine } = require('./DynastyEngine');
const { TitleEngine } = require('./TitleEngine');
const { EconomyEngine } = require('./EconomyEngine');
const { MilitaryEngine } = require('./MilitaryEngine');
const { DiplomacyEngine } = require('./DiplomacyEngine');
const { IntrigueEngine } = require('./IntrigueEngine');
const { ReligionEngine } = require('./ReligionEngine');
const { CultureEngine } = require('./CultureEngine');
const { EventEngine } = require('./EventEngine');
const { AIEngine } = require('./AIEngine');

/**
 * GameLoop — Server-authoritative tick loop.
 * Coordinates all simulation subsystems with daily, monthly, and yearly ticks.
 * Uses an event queue for efficient scheduling instead of brute-force scanning.
 */
class GameLoop {
  constructor(prisma) {
    this.prisma = prisma;

    // Engine subsystems
    this.characterEngine = new CharacterEngine();
    this.dynastyEngine = new DynastyEngine();
    this.titleEngine = new TitleEngine();
    this.economyEngine = new EconomyEngine();
    this.militaryEngine = new MilitaryEngine();
    this.diplomacyEngine = new DiplomacyEngine();
    this.intrigueEngine = new IntrigueEngine();
    this.religionEngine = new ReligionEngine();
    this.cultureEngine = new CultureEngine();
    this.eventEngine = new EventEngine();
    this.aiEngine = new AIEngine();

    // Session state
    this.sessions = new Map(); // sessionId -> GameState
  }

  /**
   * Initialize game state for a session.
   */
  async initSession(sessionId, savegameId) {
    const state = await this.loadGameState(savegameId);
    state.eventQueue = new EventQueue();
    state.tickSpeed = 1;
    state.isPaused = true;
    state.tickInterval = null;
    state.savegameId = savegameId;
    state.sessionId = sessionId;
    state.pendingEvents = []; // Events waiting for player response
    state.tickCount = 0;

    this.sessions.set(sessionId, state);
    return state;
  }

  /**
   * Load game state from database.
   */
  async loadGameState(savegameId) {
    const [characters, dynasties, titles, holdings, wars, religions, cultures, schemes, armies] =
      await Promise.all([
        this.prisma.character.findMany({
          where: { savegameId },
          include: { traits: true },
        }),
        this.prisma.dynasty.findMany({ where: { savegameId } }),
        this.prisma.title.findMany({ where: { savegameId } }),
        this.prisma.holding.findMany({
          where: { savegameId },
          include: { buildings: true },
        }),
        this.prisma.war.findMany({
          where: { savegameId, endDate: null },
          include: { participants: true },
        }),
        this.prisma.religion.findMany({ where: { savegameId } }),
        this.prisma.culture.findMany({ where: { savegameId } }),
        this.prisma.scheme.findMany({ where: { savegameId, isActive: true } }),
        this.prisma.army.findMany({
          where: { savegameId },
          include: { menAtArms: true },
        }),
      ]);

    const savegame = await this.prisma.savegame.findUnique({ where: { id: savegameId } });

    return {
      gameDate: savegame?.gameDate || 0,
      characters,
      dynasties,
      titles,
      holdings,
      wars,
      religions,
      cultures,
      schemes,
      armies,
    };
  }

  /**
   * Start the tick loop for a session.
   */
  startTickLoop(sessionId, io) {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    state.isPaused = false;

    // Tick interval: base speed is 1 day per 500ms
    const intervalMs = Math.max(100, 500 / state.tickSpeed);

    if (state.tickInterval) clearInterval(state.tickInterval);

    state.tickInterval = setInterval(async () => {
      if (state.isPaused || state.pendingEvents.length > 0) return;

      try {
        const tickResult = await this.processTick(state);

        // Broadcast tick result to all players in the session
        io.to(`session_${sessionId}`).emit('tick', {
          gameDate: state.gameDate,
          events: tickResult.events,
          updates: tickResult.updates,
        });

        // If there are events requiring player input, pause
        if (tickResult.playerEvents.length > 0) {
          state.pendingEvents = tickResult.playerEvents;
          io.to(`session_${sessionId}`).emit('events_pending', {
            events: tickResult.playerEvents,
          });
        }

        // Auto-save every 100 ticks
        state.tickCount++;
        if (state.tickCount % 100 === 0) {
          await this.saveGameState(state);
        }
      } catch (err) {
        console.error(`Tick error for session ${sessionId}:`, err);
      }
    }, intervalMs);
  }

  /**
   * Pause the tick loop.
   */
  pauseTickLoop(sessionId) {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.isPaused = true;
  }

  /**
   * Set tick speed (1-5).
   */
  setTickSpeed(sessionId, speed) {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.tickSpeed = Math.max(1, Math.min(5, speed));

    // Restart interval with new speed
    if (!state.isPaused) {
      this.startTickLoop(sessionId, state._io);
    }
  }

  /**
   * Process a single game tick (1 day).
   */
  async processTick(state) {
    state.gameDate++;
    const currentDay = state.gameDate;
    const result = { events: [], updates: {}, playerEvents: [] };

    // ─── Daily Processing ───

    // Process event queue
    const dueEvents = state.eventQueue.extractDue(currentDay);
    for (const event of dueEvents) {
      result.events.push(event);
    }

    // Building construction progress
    const completedBuildings = this.economyEngine.processDailyConstruction(state.holdings);
    if (completedBuildings.length > 0) {
      result.events.push(...completedBuildings.map((b) => ({
        type: 'building_complete',
        ...b,
      })));
    }

    // Army movement (simplified: instant for now)
    for (const army of state.armies) {
      if (army.targetX != null && army.targetY != null && army.isRaised) {
        const dx = army.targetX - army.posX;
        const dy = army.targetY - army.posY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const speed = 5; // units per day
        if (dist <= speed) {
          army.posX = army.targetX;
          army.posY = army.targetY;
          army.targetX = null;
          army.targetY = null;
        } else {
          army.posX += (dx / dist) * speed;
          army.posY += (dy / dist) * speed;
        }
      }
    }

    // ─── Monthly Processing (every 30 days) ───
    if (currentDay % 30 === 0) {
      // Economy: gold income for all characters with holdings
      const rulerIds = [...new Set(state.titles.filter((t) => t.holderId).map((t) => t.holderId))];
      for (const rulerId of rulerIds) {
        const ruler = state.characters.find((c) => c.id === rulerId);
        if (!ruler || !ruler.isAlive) continue;

        const income = this.economyEngine.calculateMonthlyIncome(
          rulerId, state.titles, state.holdings, state.titles
        );
        ruler.gold += income.total;

        // Army maintenance
        const rulerArmies = state.armies.filter((a) => a.ownerId === rulerId);
        for (const army of rulerArmies) {
          const maintenance = this.militaryEngine.calculateArmyMaintenance(army);
          ruler.gold -= maintenance;
        }
      }

      // Development growth
      this.economyEngine.processMonthlyDevelopment(state.holdings);

      // Lifestyle XP
      this.characterEngine.processMonthlyLifestyle(state.characters);

      // Fertility / Births
      const births = this.characterEngine.processMonthlyFertility(state.characters, currentDay);
      for (const birth of births) {
        const child = this.characterEngine.generateChild(birth.father, birth.mother, currentDay);
        // Assign name
        child.firstName = this.generateName(child.isMale);
        result.events.push({ type: 'birth', child, fatherId: birth.father.id, motherId: birth.mother.id });
      }

      // Scheme progress
      const schemeEvents = this.intrigueEngine.processMonthlySchemes(state.schemes, state.characters);
      result.events.push(...schemeEvents);

      // Religion: piety and fervor
      for (const char of state.characters) {
        if (!char.isAlive) continue;
        const charHoldings = this.getCharacterHoldings(char.id, state);
        const monthlyPiety = this.religionEngine.calculateMonthlyPiety(char, charHoldings, []);
        char.piety += monthlyPiety;
      }
      this.religionEngine.processMonthlyFervor(state.religions, state.wars);

      // Culture: innovation progress
      const counties = state.titles.filter((t) => t.tier === 'county');
      const innovationUnlocks = this.cultureEngine.processMonthlyInnovation(
        state.cultures, counties, state.characters
      );
      if (innovationUnlocks.length > 0) {
        result.events.push(...innovationUnlocks.map((u) => ({
          type: 'innovation_unlocked', ...u,
        })));
      }

      // Dynasty renown
      for (const dynasty of state.dynasties) {
        const members = state.characters.filter((c) => c.dynastyId === dynasty.id);
        const renown = this.dynastyEngine.calculateMonthlyRenown(dynasty, members, state.titles);
        dynasty.renown += renown;
      }

      // Faction power
      const factions = []; // Would load from state
      for (const faction of factions) {
        // Calculate and check faction firing
      }

      // AI decisions
      const aiActions = this.aiEngine.processAIDecisions(state.characters, state.titles, currentDay);
      result.events.push(...aiActions);

      // Random events for player characters
      for (const char of state.characters) {
        if (!char.isAlive || !char.isPlayer) continue;

        const context = {
          age: this.characterEngine.getAge(char, currentDay),
          isRuler: state.titles.some((t) => t.holderId === char.id),
          vassalCount: state.titles.filter((t) => t.liegeId && state.titles.find(
            (lt) => lt.id === t.liegeId && lt.holderId === char.id
          )).length,
          childrenCount: state.characters.filter((c) => c.fatherId === char.id).length,
          month: Math.floor(currentDay / 30) % 12 + 1,
          levies: this.economyEngine.calculateLevies(char.id, state.titles, state.holdings),
        };

        const triggered = this.eventEngine.checkEvents(char, context, currentDay);
        for (const event of triggered) {
          result.playerEvents.push(event);
        }
      }
    }

    // ─── Yearly Processing (every 365 days) ───
    if (currentDay % 365 === 0) {
      const agingEvents = this.characterEngine.processYearlyAging(state.characters, currentDay);
      result.events.push(...agingEvents);

      // Handle deaths — succession
      for (const event of agingEvents) {
        if (event.type === 'character_death') {
          const dead = state.characters.find((c) => c.id === event.characterId);
          if (dead) {
            await this.processCharacterDeath(dead, state, result);
          }
        }
      }
    }

    result.updates = {
      gameDate: state.gameDate,
      characterCount: state.characters.filter((c) => c.isAlive).length,
    };

    return result;
  }

  /**
   * Process character death: succession, dynasty head, etc.
   */
  async processCharacterDeath(deadChar, state, result) {
    // Title succession
    const heldTitles = state.titles.filter((t) => t.holderId === deadChar.id);
    for (const title of heldTitles) {
      const succession = this.titleEngine.resolveTitleSuccession(
        title, deadChar, state.characters, state.titles
      );
      if (succession) {
        for (const s of succession) {
          const t = state.titles.find((t) => t.id === s.titleId);
          if (t) {
            t.holderId = s.heirId;
            result.events.push({
              type: 'title_inherited',
              titleId: s.titleId,
              heirId: s.heirId,
              previousHolderId: deadChar.id,
            });
          }
        }
      }
    }

    // Dynasty head succession
    if (deadChar.dynastyId) {
      const dynasty = state.dynasties.find((d) => d.id === deadChar.dynastyId);
      if (dynasty && dynasty.headId === deadChar.id) {
        const members = state.characters.filter((c) => c.dynastyId === dynasty.id);
        const newHead = this.dynastyEngine.succeedDynastyHead(dynasty, members, state.titles);
        if (newHead) {
          dynasty.headId = newHead.id;
          result.events.push({
            type: 'dynasty_head_changed',
            dynastyId: dynasty.id,
            newHeadId: newHead.id,
          });
        }
      }
    }
  }

  /**
   * Handle player event choice.
   */
  handleEventChoice(sessionId, characterId, eventKey, optionIndex) {
    const state = this.sessions.get(sessionId);
    if (!state) return null;

    const eventDef = this.eventEngine.getEventDef(eventKey);
    if (!eventDef) return null;

    const character = state.characters.find((c) => c.id === characterId);
    if (!character) return null;

    const option = eventDef.options[optionIndex];
    if (!option) return null;

    const results = this.eventEngine.applyOptionEffects(character, option);

    // Check for chained events
    const chained = this.eventEngine.getChainedEvent(eventKey);
    if (chained) {
      state.eventQueue.insert({
        eventKey: chained.eventKey,
        characterId,
        triggerDay: state.gameDate + chained.delayDays,
        data: chained.eventDef,
      });
    }

    // Remove from pending
    state.pendingEvents = state.pendingEvents.filter((e) => e.eventKey !== eventKey);

    return { results, remainingEvents: state.pendingEvents.length };
  }

  /**
   * Get helper: character's holdings.
   */
  getCharacterHoldings(characterId, state) {
    const ownedTitles = state.titles.filter((t) => t.holderId === characterId);
    const holdingsResult = [];
    for (const title of ownedTitles) {
      const titleHoldings = state.holdings.filter((h) => h.titleId === title.id);
      holdingsResult.push(...titleHoldings);
    }
    return holdingsResult;
  }

  /**
   * Save game state to database.
   */
  async saveGameState(state) {
    try {
      // Update savegame date
      await this.prisma.savegame.update({
        where: { id: state.savegameId },
        data: {
          gameDate: state.gameDate,
          gameData: {
            eventQueue: state.eventQueue.toJSON(),
            tickCount: state.tickCount,
          },
        },
      });

      // Batch update characters
      for (const char of state.characters) {
        await this.prisma.character.update({
          where: { id: char.id },
          data: {
            isAlive: char.isAlive,
            deathDate: char.deathDate,
            health: char.health,
            stress: char.stress,
            gold: char.gold,
            prestige: char.prestige,
            piety: char.piety,
            fertility: char.fertility,
            lifestyleFocus: char.lifestyleFocus,
            lifestyleXp: char.lifestyleXp,
            lifestylePerks: char.lifestylePerks,
          },
        });
      }

      // Update dynasties
      for (const dynasty of state.dynasties) {
        await this.prisma.dynasty.update({
          where: { id: dynasty.id },
          data: {
            headId: dynasty.headId,
            renown: dynasty.renown,
            perks: dynasty.perks,
          },
        });
      }

      // Update titles
      for (const title of state.titles) {
        await this.prisma.title.update({
          where: { id: title.id },
          data: { holderId: title.holderId },
        });
      }

      console.log(`💾 Game saved for session ${state.sessionId} at day ${state.gameDate}`);
    } catch (err) {
      console.error('Save error:', err);
    }
  }

  /**
   * Clean up session.
   */
  destroySession(sessionId) {
    const state = this.sessions.get(sessionId);
    if (state?.tickInterval) {
      clearInterval(state.tickInterval);
    }
    this.sessions.delete(sessionId);
  }

  /**
   * Generate a random name.
   */
  generateName(isMale) {
    const male = ['Aldric', 'Beorn', 'Caden', 'Darius', 'Edric', 'Frej', 'Gareth', 'Harald', 'Kael', 'Leoric', 'Magnus', 'Ragnar', 'Sigmund', 'Theron'];
    const female = ['Astrid', 'Brenna', 'Cordelia', 'Elara', 'Freya', 'Isolde', 'Katarina', 'Lyria', 'Maelis', 'Nessa', 'Rosalind', 'Sigrid', 'Thea', 'Vivienne'];
    const names = isMale ? male : female;
    return names[Math.floor(Math.random() * names.length)];
  }
}

module.exports = { GameLoop };
