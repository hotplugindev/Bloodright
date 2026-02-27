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
const { PopulationEngine } = require('./PopulationEngine');
const focusesData = require('../data/focuses.json');

class GameLoop {
  constructor(prisma) {
    this.prisma = prisma;
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
    this.populationEngine = new PopulationEngine();
    this.sessions = new Map();
  }

  async initSession(sessionId, savegameId) {
    const state = await this.loadGameState(savegameId);
    state.eventQueue = new EventQueue();
    state.tickSpeed = 1;
    state.isPaused = true;
    state.tickInterval = null;
    state.savegameId = savegameId;
    state.sessionId = sessionId;
    state.pendingEvents = [];
    state.tickCount = 0;

    // Load difficulty from session or savegame
    const session = await this.prisma.gameSession.findUnique({ where: { id: sessionId } });
    state.difficulty = session?.difficulty || 'normal';

    this.sessions.set(sessionId, state);
    return state;
  }

  async loadGameState(savegameId) {
    const [characters, dynasties, titles, holdings, wars, religions, cultures, schemes, armies, populations] =
      await Promise.all([
        this.prisma.character.findMany({ where: { savegameId }, include: { traits: true } }),
        this.prisma.dynasty.findMany({ where: { savegameId } }),
        this.prisma.title.findMany({ where: { savegameId } }),
        this.prisma.holding.findMany({ where: { savegameId }, include: { buildings: true } }),
        this.prisma.war.findMany({ where: { savegameId, endDate: null }, include: { participants: true } }),
        this.prisma.religion.findMany({ where: { savegameId } }),
        this.prisma.culture.findMany({ where: { savegameId } }),
        this.prisma.scheme.findMany({ where: { savegameId, isActive: true } }),
        this.prisma.army.findMany({ where: { savegameId }, include: { menAtArms: true } }),
        this.prisma.population.findMany({ where: { savegameId, isAlive: true } }),
      ]);
    const savegame = await this.prisma.savegame.findUnique({ where: { id: savegameId } });
    return { gameDate: savegame?.gameDate || 0, characters, dynasties, titles, holdings, wars, religions, cultures, schemes, armies, populations };
  }

  startTickLoop(sessionId, io) {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.isPaused = false;
    state._io = io;
    const intervalMs = Math.max(100, 500 / state.tickSpeed);
    if (state.tickInterval) clearInterval(state.tickInterval);
    state.tickInterval = setInterval(async () => {
      if (state.isPaused || state.pendingEvents.length > 0) return;
      try {
        const tickResult = await this.processTick(state);
        io.to(`session_${sessionId}`).emit('tick', {
          gameDate: state.gameDate,
          events: tickResult.events,
          updates: tickResult.updates,
        });
        if (tickResult.playerEvents.length > 0) {
          state.pendingEvents = tickResult.playerEvents;
          io.to(`session_${sessionId}`).emit('events_pending', { events: tickResult.playerEvents });
        }
        state.tickCount++;
        if (state.tickCount % 100 === 0) await this.saveGameState(state);
      } catch (err) {
        console.error(`Tick error for session ${sessionId}:`, err);
      }
    }, intervalMs);
  }

  pauseTickLoop(sessionId) {
    const state = this.sessions.get(sessionId);
    if (state) state.isPaused = true;
  }

  setTickSpeed(sessionId, speed) {
    const state = this.sessions.get(sessionId);
    if (!state) return;
    state.tickSpeed = Math.max(1, Math.min(5, speed));
    if (!state.isPaused && state._io) this.startTickLoop(sessionId, state._io);
  }

  async processTick(state) {
    state.gameDate++;
    const currentDay = state.gameDate;
    const result = { events: [], updates: {}, playerEvents: [] };
    const counties = state.titles.filter((t) => t.tier === 'county');

    // ─── DAILY ───
    const dueEvents = state.eventQueue.extractDue(currentDay);
    for (const e of dueEvents) result.events.push(e);

    const completedBuildings = this.economyEngine.processDailyConstruction(state.holdings);
    if (completedBuildings.length > 0) {
      result.events.push(...completedBuildings.map((b) => ({ type: 'building_complete', ...b })));
    }

    // Army movement + battles
    const militaryEvents = this.militaryEngine.processDailyArmyMovement(
      state.armies, counties, state.characters, state.wars, state.titles
    );
    result.events.push(...militaryEvents);

    // Sieges
    const siegeEvents = this.militaryEngine.processDailySieges(
      state.armies, state.holdings, counties, state.wars, state.titles
    );
    result.events.push(...siegeEvents);

    // Set war endDate properly for ended wars and disband armies
    for (const ev of [...militaryEvents, ...siegeEvents]) {
      if (ev.type === 'war_ended') {
        const war = state.wars.find((w) => w.id === ev.warId);
        if (war) war.endDate = currentDay;

        // Disband all armies involved
        for (const army of state.armies) {
          if (army.ownerId === ev.attackerId || army.ownerId === ev.defenderId) {
            army.isRaised = false;
            army.isMoving = false;
            army.isSieging = false;
            army.siegeProgress = 0;
          }
        }
      }
    }

    // ─── MONTHLY (every 30 days) ───
    if (currentDay % 30 === 0) {
      const rulerIds = [...new Set(state.titles.filter((t) => t.holderId).map((t) => t.holderId))];
      for (const rulerId of rulerIds) {
        const ruler = state.characters.find((c) => c.id === rulerId);
        if (!ruler || !ruler.isAlive) continue;

        const income = this.economyEngine.calculateMonthlyIncome(rulerId, state.titles, state.holdings, state.titles);
        let totalIncome = income.total;

        // Apply ruler focus effects
        const focus = ruler.rulerFocus ? focusesData[ruler.rulerFocus] : null;
        if (focus?.effects?.tax_mult) totalIncome *= (1 + focus.effects.tax_mult);

        ruler.gold += totalIncome;

        // Army maintenance
        const rulerArmies = state.armies.filter((a) => a.ownerId === rulerId);
        for (const army of rulerArmies) {
          let maint = this.militaryEngine.calculateArmyMaintenance(army);
          if (focus?.effects?.army_maintenance_mult) maint *= (1 + focus.effects.army_maintenance_mult);
          ruler.gold -= maint;
        }
      }

      // Development growth
      this.economyEngine.processMonthlyDevelopment(state.holdings);

      // Lifestyle XP
      this.characterEngine.processMonthlyLifestyle(state.characters);

      // Character fertility/births
      const births = this.characterEngine.processMonthlyFertility(state.characters, currentDay);
      for (const birth of births) {
        const child = this.characterEngine.generateChild(birth.father, birth.mother, currentDay);
        child.firstName = this.generateName(child.isMale);
        child.id = Date.now() + Math.floor(Math.random() * 10000);
        child.savegameId = state.savegameId;
        child.traits = [];
        state.characters.push(child);
        result.events.push({ type: 'birth', child, fatherId: birth.father.id, motherId: birth.mother.id });
      }

      // Population fertility
      const popBirths = this.populationEngine.processMonthlyFertility(state.populations, currentDay);
      for (const birth of popBirths) {
        const popChild = this.populationEngine.generateChild(birth.father, birth.mother, currentDay);
        popChild.id = Date.now() + Math.floor(Math.random() * 100000);
        state.populations.push(popChild);
      }

      // Population auto-marriage
      this.populationEngine.processMonthlyMarriages(state.populations, currentDay);

      // Ruler-population marriage births (when ruler married a population member)
      for (const char of state.characters) {
        if (!char.isAlive || !char.isPlayer) continue;
        // Find population spouse
        const popSpouse = state.populations.find((p) =>
          p.isAlive && p.spouseType === 'character' && p.spouseId === char.id
        );
        if (!popSpouse) continue;
        const motherAge = this.populationEngine.getAge(popSpouse, currentDay);
        if (motherAge < 16 || motherAge > 43) continue;
        const chance = char.fertility * popSpouse.fertility * 0.03;
        if (Math.random() < chance) {
          const heir = this.populationEngine.generateRulerChild(char, popSpouse, currentDay);
          heir.id = Date.now() + Math.floor(Math.random() * 10000);
          heir.savegameId = state.savegameId;
          heir.traits = [];
          state.characters.push(heir);
          result.events.push({ type: 'birth', child: heir, fatherId: char.id, motherId: null });
        }
      }

      // Schemes
      const schemeEvents = this.intrigueEngine.processMonthlySchemes(state.schemes, state.characters);
      result.events.push(...schemeEvents);

      // Religion
      for (const char of state.characters) {
        if (!char.isAlive) continue;
        const charHoldings = this.getCharacterHoldings(char.id, state);
        const monthlyPiety = this.religionEngine.calculateMonthlyPiety(char, charHoldings, []);
        let pietyMult = 1.0;
        const focus = char.rulerFocus ? focusesData[char.rulerFocus] : null;
        if (focus?.effects?.piety_mult) pietyMult += focus.effects.piety_mult;
        char.piety += monthlyPiety * pietyMult;
      }
      this.religionEngine.processMonthlyFervor(state.religions, state.wars);

      // Culture
      const innovationUnlocks = this.cultureEngine.processMonthlyInnovation(
        state.cultures, counties, state.characters
      );
      if (innovationUnlocks.length > 0) {
        result.events.push(...innovationUnlocks.map((u) => ({ type: 'innovation_unlocked', ...u })));
      }

      // Dynasty renown
      for (const dynasty of state.dynasties) {
        const members = state.characters.filter((c) => c.dynastyId === dynasty.id);
        dynasty.renown += this.dynastyEngine.calculateMonthlyRenown(dynasty, members, state.titles);
      }

      // AI decisions — full turn processing with difficulty
      const aiActions = this.aiEngine.processAITurn(state, state.difficulty || 'normal', this.economyEngine, this.militaryEngine);
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
        for (const event of triggered) result.playerEvents.push(event);
      }
    }

    // ─── YEARLY (every 365 days) ───
    if (currentDay % 365 === 0) {
      const agingEvents = this.characterEngine.processYearlyAging(state.characters, currentDay);
      result.events.push(...agingEvents);

      for (const event of agingEvents) {
        if (event.type === 'character_death') {
          const dead = state.characters.find((c) => c.id === event.characterId);
          if (dead) {
            await this.processCharacterDeath(dead, state, result);
            // Disband dead ruler's armies
            for (const army of state.armies) {
              if (army.ownerId === dead.id) {
                army.isRaised = false;
                army.isMoving = false;
                army.isSieging = false;
              }
            }
          }
        }
      }

      // Population aging
      const popAgingEvents = this.populationEngine.processYearlyAging(state.populations, currentDay);
      result.events.push(...popAgingEvents);
    }

    // Build result updates
    result.updates = {
      gameDate: state.gameDate,
      characterCount: state.characters.filter((c) => c.isAlive).length,
    };

    if (currentDay % 30 === 0) {
      result.updates.characterUpdates = state.characters
        .filter((c) => c.isAlive)
        .map((c) => ({
          id: c.id, firstName: c.firstName, lastName: c.lastName,
          isMale: c.isMale, birthDate: c.birthDate,
          gold: c.gold, prestige: c.prestige, piety: c.piety,
          health: c.health, stress: c.stress, isAlive: c.isAlive,
          fertility: c.fertility, rulerFocus: c.rulerFocus,
          dynastyId: c.dynastyId, cultureId: c.cultureId, religionId: c.religionId,
          fatherId: c.fatherId, spouseId: c.spouseId, isPlayer: c.isPlayer,
          diplomacy: c.diplomacy, martial: c.martial, stewardship: c.stewardship,
          intrigue: c.intrigue, learning: c.learning, prowess: c.prowess,
          traits: (c.traits || []).map((t) => t.traitKey || t),
        }));

      // Also include recently dead characters so client knows about deaths
      const recentlyDead = state.characters.filter((c) => !c.isAlive && c.deathDate && c.deathDate >= currentDay - 30);
      for (const dead of recentlyDead) {
        if (!result.updates.characterUpdates.find((u) => u.id === dead.id)) {
          result.updates.characterUpdates.push({
            id: dead.id, firstName: dead.firstName, lastName: dead.lastName,
            isMale: dead.isMale, birthDate: dead.birthDate,
            gold: dead.gold, prestige: dead.prestige, piety: dead.piety,
            health: dead.health, stress: dead.stress, isAlive: false,
            deathDate: dead.deathDate, fertility: dead.fertility,
            rulerFocus: dead.rulerFocus,
            dynastyId: dead.dynastyId, fatherId: dead.fatherId,
            spouseId: dead.spouseId, isPlayer: dead.isPlayer,
            diplomacy: dead.diplomacy, martial: dead.martial,
            stewardship: dead.stewardship, intrigue: dead.intrigue,
            learning: dead.learning, prowess: dead.prowess,
            traits: (dead.traits || []).map((t) => t.traitKey || t),
          });
        }
      }

      result.updates.armyUpdates = state.armies
        .map((a) => ({
          id: a.id, ownerId: a.ownerId, posX: a.posX, posY: a.posY,
          targetX: a.targetX, targetY: a.targetY, levies: a.levies,
          morale: a.morale, isRaised: a.isRaised, isMoving: a.isMoving,
          isSieging: a.isSieging, siegeProgress: a.siegeProgress,
          targetCountyId: a.targetCountyId,
          commanderId: a.commanderId, name: a.name,
          menAtArms: (a.menAtArms || []).map((m) => ({ type: m.type, count: m.count, maxCount: m.maxCount })),
        }));

      result.updates.populationCount = state.populations.filter((p) => p.isAlive).length;

      // Send title ownership updates (for war annexation, inheritance, etc.)
      result.updates.titleUpdates = state.titles
        .filter((t) => t.holderId)
        .map((t) => ({ id: t.id, holderId: t.holderId }));

      result.updates.warUpdates = state.wars
        .map((w) => ({
          id: w.id, warScore: w.warScore, attackerId: w.attackerId,
          defenderId: w.defenderId, name: w.name, casusBelli: w.casusBelli,
          startDate: w.startDate, endDate: w.endDate, result: w.result,
          targetTitle: w.targetTitle,
        }));
    }

    // Send army positions every tick if armies are moving
    if (state.armies.some((a) => a.isRaised && a.isMoving)) {
      result.updates.armyPositions = state.armies
        .filter((a) => a.isRaised)
        .map((a) => ({ id: a.id, posX: a.posX, posY: a.posY, isMoving: a.isMoving, isSieging: a.isSieging, siegeProgress: a.siegeProgress }));
    }

    return result;
  }

  async processCharacterDeath(deadChar, state, result) {
    const heldTitles = state.titles.filter((t) => t.holderId === deadChar.id);
    let primaryHeir = null;

    for (const title of heldTitles) {
      const succession = this.titleEngine.resolveTitleSuccession(title, deadChar, state.characters, state.titles);
      if (succession) {
        for (const s of succession) {
          const t = state.titles.find((t) => t.id === s.titleId);
          if (t) {
            t.holderId = s.heirId;
            if (!primaryHeir) primaryHeir = s.heirId;
            result.events.push({ type: 'title_inherited', titleId: s.titleId, heirId: s.heirId, previousHolderId: deadChar.id });
          }
        }
      }
    }

    // If the dead character was a player, switch control to their heir
    if (deadChar.isPlayer && primaryHeir) {
      const heir = state.characters.find((c) => c.id === primaryHeir);
      if (heir) {
        deadChar.isPlayer = false;
        heir.isPlayer = true;

        // Update session user in DB to point to heir
        try {
          const sessionUsers = await this.prisma.sessionUser.findMany({
            where: { sessionId: state.sessionId, characterId: deadChar.id },
          });
          for (const su of sessionUsers) {
            await this.prisma.sessionUser.update({
              where: { id: su.id },
              data: { characterId: heir.id },
            });
          }
        } catch (e) {
          console.warn('Failed to update session user for succession:', e.message);
        }

        result.events.push({
          type: 'player_heir_succession',
          deadRulerId: deadChar.id,
          heirId: heir.id,
          heirName: `${heir.firstName} ${heir.lastName}`,
        });
      }
    }

    if (deadChar.dynastyId) {
      const dynasty = state.dynasties.find((d) => d.id === deadChar.dynastyId);
      if (dynasty && dynasty.headId === deadChar.id) {
        const members = state.characters.filter((c) => c.dynastyId === dynasty.id);
        const newHead = this.dynastyEngine.succeedDynastyHead(dynasty, members, state.titles);
        if (newHead) {
          dynasty.headId = newHead.id;
          result.events.push({ type: 'dynasty_head_changed', dynastyId: dynasty.id, newHeadId: newHead.id });
        }
      }
    }
  }

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
    const chained = this.eventEngine.getChainedEvent(eventKey);
    if (chained) {
      state.eventQueue.insert({ eventKey: chained.eventKey, characterId, triggerDay: state.gameDate + chained.delayDays, data: chained.eventDef });
    }
    state.pendingEvents = state.pendingEvents.filter((e) => e.eventKey !== eventKey);
    return { results, remainingEvents: state.pendingEvents.length };
  }

  getCharacterHoldings(characterId, state) {
    const ownedTitles = state.titles.filter((t) => t.holderId === characterId);
    const holdingsResult = [];
    for (const title of ownedTitles) holdingsResult.push(...state.holdings.filter((h) => h.titleId === title.id));
    return holdingsResult;
  }

  async saveGameState(state) {
    try {
      await this.prisma.savegame.update({
        where: { id: state.savegameId },
        data: { gameDate: state.gameDate, gameData: { eventQueue: state.eventQueue.toJSON(), tickCount: state.tickCount } },
      });

      // Save characters
      for (const char of state.characters) {
        if (!char.id || typeof char.id !== 'number') continue;

        if (char.id > 1e12) {
          // New character born during gameplay — insert into DB
          try {
            const created = await this.prisma.character.create({
              data: {
                savegameId: state.savegameId,
                firstName: char.firstName, lastName: char.lastName,
                isMale: char.isMale, birthDate: char.birthDate,
                deathDate: char.deathDate || null,
                isAlive: char.isAlive, isPlayer: char.isPlayer || false,
                diplomacy: char.diplomacy || 5, martial: char.martial || 5,
                stewardship: char.stewardship || 5, intrigue: char.intrigue || 5,
                learning: char.learning || 5, prowess: char.prowess || 5,
                health: char.health, fertility: char.fertility,
                stress: char.stress || 0, piety: char.piety || 0,
                prestige: char.prestige || 0, gold: char.gold || 0,
                geneticTraits: char.geneticTraits || [],
                lifestyleFocus: char.lifestyleFocus, lifestyleXp: char.lifestyleXp,
                lifestylePerks: char.lifestylePerks, rulerFocus: char.rulerFocus,
                dynastyId: char.dynastyId || null,
                fatherId: (char.fatherId && char.fatherId < 1e12) ? char.fatherId : null,
                spouseId: (char.spouseId && char.spouseId < 1e12) ? char.spouseId : null,
                cultureId: char.cultureId || null,
                religionId: char.religionId || null,
              },
            });
            const oldId = char.id;
            char.id = created.id; // Update in-memory ID to real DB ID

            // Update any references to old ID (children's fatherId, title holderId, army ownerId)
            for (const c of state.characters) {
              if (c.fatherId === oldId) c.fatherId = created.id;
              if (c.spouseId === oldId) c.spouseId = created.id;
            }
            for (const t of state.titles) {
              if (t.holderId === oldId) t.holderId = created.id;
            }
            for (const a of state.armies) {
              if (a.ownerId === oldId) a.ownerId = created.id;
              if (a.commanderId === oldId) a.commanderId = created.id;
            }
          } catch (e) {
            console.warn('Failed to create character:', char.firstName, e.message);
          }
          continue;
        }

        await this.prisma.character.update({
          where: { id: char.id },
          data: {
            isAlive: char.isAlive, deathDate: char.deathDate, health: char.health,
            stress: char.stress, gold: char.gold, prestige: char.prestige, piety: char.piety,
            fertility: char.fertility, lifestyleFocus: char.lifestyleFocus,
            lifestyleXp: char.lifestyleXp, lifestylePerks: char.lifestylePerks,
            rulerFocus: char.rulerFocus, spouseId: char.spouseId, isPlayer: char.isPlayer,
          },
        });
      }

      // Save dynasties
      for (const dynasty of state.dynasties) {
        await this.prisma.dynasty.update({ where: { id: dynasty.id }, data: { headId: dynasty.headId, renown: dynasty.renown, perks: dynasty.perks } });
      }

      // Save titles (holder changes from wars/annexation)
      for (const title of state.titles) {
        await this.prisma.title.update({ where: { id: title.id }, data: { holderId: title.holderId } });
      }

      // Save armies — upsert to handle both new AI armies and existing ones
      for (const army of state.armies) {
        if (!army.id || army.id > 1e12) {
          // New army created during gameplay (AI or dynamic) — insert
          try {
            const created = await this.prisma.army.create({
              data: {
                savegameId: state.savegameId,
                ownerId: army.ownerId,
                commanderId: army.commanderId || army.ownerId,
                name: army.name,
                posX: army.posX, posY: army.posY,
                targetX: army.targetX || null, targetY: army.targetY || null,
                targetCountyId: army.targetCountyId || null,
                levies: army.levies, morale: army.morale,
                isRaised: army.isRaised,
                isMoving: army.isMoving || false,
                isSieging: army.isSieging || false,
                siegeProgress: army.siegeProgress || 0,
              },
            });
            army.id = created.id; // Update in-memory ID to real DB ID
          } catch (e) {
            console.warn('Failed to create army:', e.message);
          }
        } else {
          // Existing army — update
          try {
            await this.prisma.army.update({
              where: { id: army.id },
              data: {
                posX: army.posX, posY: army.posY,
                targetX: army.targetX || null, targetY: army.targetY || null,
                targetCountyId: army.targetCountyId || null,
                levies: army.levies, morale: army.morale,
                isRaised: army.isRaised,
                isMoving: army.isMoving || false,
                isSieging: army.isSieging || false,
                siegeProgress: army.siegeProgress || 0,
              },
            });
          } catch (e) {
            console.warn('Failed to update army:', e.message);
          }
        }
      }

      // Save wars — upsert
      for (const war of state.wars) {
        if (!war.id || war.id > 1e12) {
          try {
            const created = await this.prisma.war.create({
              data: {
                savegameId: state.savegameId,
                name: war.name, casusBelli: war.casusBelli,
                attackerId: war.attackerId, defenderId: war.defenderId,
                targetTitle: war.targetTitle || null,
                warScore: war.warScore, startDate: war.startDate,
                endDate: war.endDate || null, result: war.result || null,
              },
            });
            war.id = created.id;
          } catch (e) {
            console.warn('Failed to create war:', e.message);
          }
        } else {
          try {
            await this.prisma.war.update({
              where: { id: war.id },
              data: {
                warScore: war.warScore,
                endDate: war.endDate || null,
                result: war.result || null,
              },
            });
          } catch (e) {
            console.warn('Failed to update war:', e.message);
          }
        }
      }

      // Save holdings (development, buildings)
      for (const holding of state.holdings) {
        if (!holding.id || holding.id > 1e12) continue;
        try {
          await this.prisma.holding.update({
            where: { id: holding.id },
            data: { development: holding.development },
          });
          // Save building state
          for (const b of (holding.buildings || [])) {
            if (!b.id || b.id > 1e12) continue;
            try {
              await this.prisma.building.update({
                where: { id: b.id },
                data: { level: b.level, isBuilding: b.isBuilding, buildDays: b.buildDays },
              });
            } catch (e) { /* building may have been created in-memory */ }
          }
        } catch (e) {
          console.warn('Failed to update holding:', e.message);
        }
      }

      // Save populations
      for (const pop of state.populations) {
        if (!pop.id) continue;

        if (pop.id > 1e12) {
          // New population born during gameplay — insert into DB
          try {
            const created = await this.prisma.population.create({
              data: {
                savegameId: state.savegameId,
                countyId: pop.countyId,
                firstName: pop.firstName, lastName: pop.lastName,
                isMale: pop.isMale, birthDate: pop.birthDate,
                deathDate: pop.deathDate || null,
                isAlive: pop.isAlive,
                martial: pop.martial || 3, stewardship: pop.stewardship || 3,
                intrigue: pop.intrigue || 3, learning: pop.learning || 3,
                prowess: pop.prowess || 3, health: pop.health,
                fertility: pop.fertility || 0.5,
                traits: pop.traits || [],
                role: pop.role || null,
                spouseId: null, // Will be re-linked after all pops saved
                spouseType: pop.spouseType || null,
                fatherId: null, motherId: null,
              },
            });
            pop.id = created.id; // Update in-memory ID
          } catch (e) {
            console.warn('Failed to create population:', e.message);
          }
          continue;
        }

        try {
          await this.prisma.population.update({
            where: { id: pop.id },
            data: {
              isAlive: pop.isAlive, deathDate: pop.deathDate || null,
              health: pop.health, role: pop.role || null,
              spouseId: pop.spouseId || null, spouseType: pop.spouseType || null,
            },
          });
        } catch (e) {
          console.warn('Failed to update population:', e.message);
        }
      }

      console.log(`Game saved for session ${state.sessionId} at day ${state.gameDate}`);
    } catch (err) {
      console.error('Save error:', err);
    }
  }

  destroySession(sessionId) {
    const state = this.sessions.get(sessionId);
    if (state?.tickInterval) clearInterval(state.tickInterval);
    this.sessions.delete(sessionId);
  }

  generateName(isMale) {
    const male = ['Aldric', 'Beorn', 'Caden', 'Darius', 'Edric', 'Frej', 'Gareth', 'Harald', 'Kael', 'Leoric', 'Magnus', 'Ragnar', 'Sigmund', 'Theron'];
    const female = ['Astrid', 'Brenna', 'Cordelia', 'Elara', 'Freya', 'Isolde', 'Katarina', 'Lyria', 'Maelis', 'Nessa', 'Rosalind', 'Sigrid', 'Thea', 'Vivienne'];
    const names = isMale ? male : female;
    return names[Math.floor(Math.random() * names.length)];
  }
}

module.exports = { GameLoop };
