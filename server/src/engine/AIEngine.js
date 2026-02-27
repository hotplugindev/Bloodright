const focusesData = require('../data/focuses.json');

/**
 * AIEngine — Full AI controller for non-player rulers.
 * Handles army raising, war declarations, army movement, economy,
 * marriage, and diplomatic decisions based on difficulty level.
 */
class AIEngine {
  static DIFFICULTY_MODIFIERS = {
    easy:      { aggressiveness: 0.3, income_mult: 0.8, levy_mult: 0.8, reaction_speed: 0.5, scheme_chance: 0.3 },
    normal:    { aggressiveness: 0.6, income_mult: 1.0, levy_mult: 1.0, reaction_speed: 0.7, scheme_chance: 0.5 },
    hard:      { aggressiveness: 0.8, income_mult: 1.2, levy_mult: 1.2, reaction_speed: 0.9, scheme_chance: 0.7 },
    very_hard: { aggressiveness: 1.0, income_mult: 1.5, levy_mult: 1.5, reaction_speed: 1.0, scheme_chance: 0.9 },
  };

  static PERSONALITY_WEIGHTS = {
    brave:     { war: 1.5, scheme: 0.5, diplomacy: 0.8 },
    craven:    { war: 0.3, scheme: 1.2, diplomacy: 1.5 },
    ambitious: { war: 1.3, scheme: 1.5, diplomacy: 1.0 },
    content:   { war: 0.4, scheme: 0.3, diplomacy: 1.2 },
    generous:  { war: 0.7, scheme: 0.3, diplomacy: 1.5 },
    greedy:    { war: 1.0, scheme: 1.3, diplomacy: 0.6 },
    just:      { war: 0.8, scheme: 0.2, diplomacy: 1.3 },
    arbitrary: { war: 1.2, scheme: 1.2, diplomacy: 0.5 },
    zealous:   { war: 1.4, scheme: 0.7, diplomacy: 0.8 },
    cynical:   { war: 0.8, scheme: 1.3, diplomacy: 1.0 },
    patient:   { war: 0.5, scheme: 0.8, diplomacy: 1.3 },
    wrathful:  { war: 1.8, scheme: 1.0, diplomacy: 0.3 },
    diligent:  { war: 0.9, scheme: 0.7, diplomacy: 1.0 },
    lazy:      { war: 0.3, scheme: 0.3, diplomacy: 0.5 },
    kind:      { war: 0.4, scheme: 0.2, diplomacy: 1.6 },
    cruel:     { war: 1.5, scheme: 1.4, diplomacy: 0.4 },
    honest:    { war: 0.7, scheme: 0.1, diplomacy: 1.4 },
    deceitful: { war: 0.9, scheme: 1.6, diplomacy: 0.7 },
  };

  getPersonalityWeights(character) {
    const weights = { war: 1.0, scheme: 1.0, diplomacy: 1.0 };
    const traitKeys = (character.traits || []).map((t) => t.traitKey || t);
    for (const key of traitKeys) {
      const pw = AIEngine.PERSONALITY_WEIGHTS[key];
      if (pw) {
        weights.war *= pw.war;
        weights.scheme *= pw.scheme;
        weights.diplomacy *= pw.diplomacy;
      }
    }
    return weights;
  }

  /**
   * Main AI processing — called every monthly tick from GameLoop.
   * This is the brain of AI rulers: they raise armies, declare wars,
   * move troops, build buildings, and manage their realm.
   */
  processAITurn(state, difficulty, economyEngine, militaryEngine) {
    const actions = [];
    const diff = AIEngine.DIFFICULTY_MODIFIERS[difficulty] || AIEngine.DIFFICULTY_MODIFIERS.normal;
    const currentDay = state.gameDate;
    const counties = state.titles.filter((t) => t.tier === 'county');

    // Get all AI rulers (non-player characters who hold titles)
    const rulerIds = [...new Set(state.titles.filter((t) => t.holderId).map((t) => t.holderId))];

    for (const rulerId of rulerIds) {
      const ruler = state.characters.find((c) => c.id === rulerId);
      if (!ruler || !ruler.isAlive || ruler.isPlayer) continue;

      const personality = this.getPersonalityWeights(ruler);
      const rulerCounties = counties.filter((c) => c.holderId === rulerId);
      if (rulerCounties.length === 0) continue;

      // Stagger AI decisions so not all rulers act on same tick
      if (currentDay % 30 !== ruler.id % 30) continue;

      // ─── AI Income Bonus (difficulty scaling) ───
      if (diff.income_mult > 1.0) {
        ruler.gold += (diff.income_mult - 1.0) * rulerCounties.length * 0.5;
      }

      // ─── Set Ruler Focus if not set ───
      if (!ruler.rulerFocus && ruler.gold >= 50) {
        const focusKeys = Object.keys(focusesData);
        // Pick focus based on personality
        if (personality.war > 1.2) {
          ruler.rulerFocus = 'warlord';
        } else if (personality.diplomacy > 1.2) {
          ruler.rulerFocus = 'diplomat';
        } else {
          ruler.rulerFocus = focusKeys[Math.floor(Math.random() * focusKeys.length)];
        }
        ruler.gold -= 50;
        actions.push({ type: 'ai_set_focus', characterId: rulerId, focus: ruler.rulerFocus });
      }

      // ─── Check if at war ───
      const activeWars = state.wars.filter((w) => !w.endDate &&
        (w.attackerId === rulerId || w.defenderId === rulerId));

      // ─── Raise Army if at war and army not raised ───
      let army = state.armies.find((a) => a.ownerId === rulerId);
      if (activeWars.length > 0 && (!army || !army.isRaised)) {
        const capital = rulerCounties[0];
        if (army) {
          army.isRaised = true;
          let levies = economyEngine.calculateLevies(rulerId, state.titles, state.holdings);
          army.levies = Math.max(100, Math.floor(levies * diff.levy_mult));
          army.morale = 1.0;
          army.isMoving = false;
          army.isSieging = false;
          army.siegeProgress = 0;
          if (capital) { army.posX = capital.mapX; army.posY = capital.mapY; }
        } else {
          let levies = economyEngine.calculateLevies(rulerId, state.titles, state.holdings);
          army = {
            id: Date.now() + Math.floor(Math.random() * 100000),
            savegameId: state.savegameId,
            ownerId: rulerId,
            commanderId: rulerId,
            name: `${ruler.firstName}'s Host`,
            posX: capital?.mapX || 400,
            posY: capital?.mapY || 300,
            levies: Math.max(100, Math.floor(levies * diff.levy_mult)),
            morale: 1.0,
            isRaised: true,
            isMoving: false,
            isSieging: false,
            siegeProgress: 0,
            targetCountyId: null,
            targetX: null,
            targetY: null,
            menAtArms: [],
          };
          state.armies.push(army);
        }
        actions.push({ type: 'ai_raise_army', characterId: rulerId, levies: army.levies });
      }

      // ─── Move Army toward enemy if at war ───
      if (army && army.isRaised && !army.isMoving && !army.isSieging && activeWars.length > 0) {
        const war = activeWars[0];
        const enemyId = war.attackerId === rulerId ? war.defenderId : war.attackerId;
        const enemyCounties = counties.filter((c) => c.holderId === enemyId);

        if (enemyCounties.length > 0) {
          // Find closest enemy county
          let closest = enemyCounties[0];
          let minDist = Infinity;
          for (const ec of enemyCounties) {
            const d = Math.sqrt(Math.pow(army.posX - ec.mapX, 2) + Math.pow(army.posY - ec.mapY, 2));
            if (d < minDist) { minDist = d; closest = ec; }
          }

          // Also check if enemy army is nearby — prioritize attacking army
          const enemyArmy = state.armies.find((a) => a.ownerId === enemyId && a.isRaised);
          if (enemyArmy && Math.random() < 0.6 * diff.reaction_speed) {
            army.targetX = enemyArmy.posX;
            army.targetY = enemyArmy.posY;
            army.targetCountyId = null;
          } else {
            army.targetX = closest.mapX;
            army.targetY = closest.mapY;
            army.targetCountyId = closest.id;
          }
          army.isMoving = true;
          actions.push({ type: 'ai_move_army', characterId: rulerId, targetCountyId: army.targetCountyId });
        }
      }

      // ─── Disband Army if no wars ───
      if (army && army.isRaised && activeWars.length === 0 && !army.isMoving && !army.isSieging) {
        army.isRaised = false;
        army.isMoving = false;
        army.isSieging = false;
        army.siegeProgress = 0;
        actions.push({ type: 'ai_disband_army', characterId: rulerId });
      }

      // ─── Consider declaring war ───
      if (activeWars.length === 0 && rulerCounties.length > 0 && Math.random() < 0.05 * diff.aggressiveness * personality.war) {
        // Find a neighboring ruler to attack
        const neighborRulerIds = this.findNeighborRulers(rulerId, counties);
        if (neighborRulerIds.length > 0) {
          // Pick weakest neighbor
          let bestTarget = null;
          let bestScore = -Infinity;
          for (const targetId of neighborRulerIds) {
            const target = state.characters.find((c) => c.id === targetId);
            if (!target || !target.isAlive) continue;
            // Don't attack someone already at war with us
            const alreadyAtWar = state.wars.some((w) => !w.endDate &&
              ((w.attackerId === rulerId && w.defenderId === targetId) ||
               (w.attackerId === targetId && w.defenderId === rulerId)));
            if (alreadyAtWar) continue;

            const targetCountyCount = counties.filter((c) => c.holderId === targetId).length;
            const myPower = rulerCounties.length;
            // Prefer attacking weaker neighbors
            const score = (myPower - targetCountyCount) * 10 + ruler.martial - (target.martial || 5);
            if (score > bestScore) {
              bestScore = score;
              bestTarget = target;
            }
          }

          if (bestTarget && (bestScore > -5 || Math.random() < 0.2 * diff.aggressiveness)) {
            const war = {
              id: Date.now() + Math.floor(Math.random() * 100000),
              savegameId: state.savegameId,
              name: `${ruler.firstName}'s conquest against ${bestTarget.firstName}`,
              casusBelli: 'conquest',
              attackerId: rulerId,
              defenderId: bestTarget.id,
              targetTitle: null,
              warScore: 0,
              startDate: currentDay,
              endDate: null,
              result: null,
              participants: [],
            };
            state.wars.push(war);
            ruler.prestige -= 50;
            actions.push({
              type: 'war_declared',
              war,
              attackerId: rulerId,
              defenderId: bestTarget.id,
            });
          }
        }
      }

      // ─── Build buildings if wealthy ───
      if (ruler.gold > 150 && Math.random() < 0.3) {
        const rulerHoldings = [];
        for (const county of rulerCounties) {
          const baronies = state.titles.filter((t) => t.deJureParentId === county.id && t.tier === 'barony');
          for (const b of baronies) {
            const h = state.holdings.find((h) => h.titleId === b.id);
            if (h) rulerHoldings.push(h);
          }
        }
        if (rulerHoldings.length > 0) {
          const holding = rulerHoldings[Math.floor(Math.random() * rulerHoldings.length)];
          const buildingKeys = ['castle_walls', 'farm_estate', 'barracks', 'market'];
          const key = buildingKeys[Math.floor(Math.random() * buildingKeys.length)];
          const existing = (holding.buildings || []).find((b) => b.buildingKey === key);
          if (!existing || existing.level < 3) {
            // Simplified build — just deduct gold and upgrade
            ruler.gold -= 100;
            if (existing) {
              existing.level++;
            } else {
              holding.buildings = holding.buildings || [];
              holding.buildings.push({ id: Date.now(), buildingKey: key, level: 1, isBuilding: false, buildDays: 0, holdingId: holding.id });
            }
          }
        }
      }

      // ─── Lifestyle focus ───
      if (!ruler.lifestyleFocus) {
        ruler.lifestyleFocus = this.chooseLifestyleFocus(ruler);
        actions.push({ type: 'set_lifestyle', characterId: rulerId, focus: ruler.lifestyleFocus });
      }
    }

    return actions;
  }

  /**
   * Find ruler IDs that are neighbors (hold counties adjacent to ours).
   */
  findNeighborRulers(rulerId, counties) {
    const myCounties = counties.filter((c) => c.holderId === rulerId);
    const neighborIds = new Set();

    for (const myC of myCounties) {
      if (myC.mapX == null || myC.mapY == null) continue;
      for (const other of counties) {
        if (other.holderId === rulerId || !other.holderId) continue;
        if (other.mapX == null || other.mapY == null) continue;
        const dist = Math.sqrt(Math.pow(myC.mapX - other.mapX, 2) + Math.pow(myC.mapY - other.mapY, 2));
        if (dist < 200) { // Within "neighbor" range
          neighborIds.add(other.holderId);
        }
      }
    }

    return [...neighborIds];
  }

  /**
   * Choose a lifestyle focus for an AI character.
   */
  chooseLifestyleFocus(character) {
    const stats = {
      diplomacy: character.diplomacy,
      martial: character.martial,
      stewardship: character.stewardship,
      intrigue: character.intrigue,
      learning: character.learning,
    };
    const entries = Object.entries(stats).map(([key, val]) => ({
      key,
      score: val + Math.random() * 5,
    }));
    entries.sort((a, b) => b.score - a.score);
    return entries[0].key;
  }

  /**
   * Legacy method kept for compatibility — now delegates to processAITurn.
   */
  processAIDecisions(characters, allTitles, currentDay) {
    return []; // Replaced by processAITurn
  }
}

module.exports = { AIEngine };
