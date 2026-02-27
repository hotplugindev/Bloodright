const focusesData = require('../data/focuses.json');

/**
 * MilitaryEngine — Handles army composition, movement, combat resolution,
 * siege warfare, war score tracking, and commander effects.
 */
class MilitaryEngine {
  static MAA_TYPES = {
    pikemen:  { attack: 10, defense: 18, toughness: 15, pursuit: 0, screen: 10, counter: 'cavalry', cost: 1.5 },
    archers:  { attack: 14, defense: 4, toughness: 8, pursuit: 0, screen: 6, counter: 'pikemen', cost: 1.0 },
    cavalry:  { attack: 18, defense: 8, toughness: 12, pursuit: 30, screen: 0, counter: 'archers', cost: 3.0 },
    siege:    { attack: 2, defense: 2, toughness: 5, pursuit: 0, screen: 0, siegeBonus: 20, cost: 4.0 },
  };

  static TERRAIN_MODIFIERS = {
    plains:    { attacker: 1.0, defender: 1.0, moveSpeed: 1.0 },
    hills:     { attacker: 0.85, defender: 1.15, moveSpeed: 0.8 },
    mountains: { attacker: 0.7, defender: 1.4, moveSpeed: 0.5 },
    forest:    { attacker: 0.8, defender: 1.2, moveSpeed: 0.7 },
    desert:    { attacker: 0.9, defender: 0.95, moveSpeed: 0.9 },
    coast:     { attacker: 0.95, defender: 1.05, moveSpeed: 1.0 },
    marsh:     { attacker: 0.75, defender: 1.1, moveSpeed: 0.6 },
  };

  /**
   * Process daily army movement for all armies.
   * Returns battle events when armies collide.
   */
  processDailyArmyMovement(armies, counties, characters, wars, allTitles) {
    const events = [];

    for (const army of armies) {
      if (!army.isRaised || !army.isMoving) continue;
      if (army.targetX == null || army.targetY == null) {
        army.isMoving = false;
        continue;
      }

      // Calculate movement speed based on terrain
      const currentCounty = this.findNearestCounty(army.posX, army.posY, counties);
      const terrain = currentCounty?.terrain || 'plains';
      const terrainMod = MilitaryEngine.TERRAIN_MODIFIERS[terrain] || { moveSpeed: 1.0 };

      // Ruler focus bonus
      const owner = characters.find((c) => c.id === army.ownerId);
      let speedMult = 1.0;
      if (owner?.rulerFocus === 'warlord') speedMult = 1.1;

      const baseSpeed = 8 * terrainMod.moveSpeed * speedMult;
      const dx = army.targetX - army.posX;
      const dy = army.targetY - army.posY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= baseSpeed) {
        army.posX = army.targetX;
        army.posY = army.targetY;
        army.targetX = null;
        army.targetY = null;
        army.isMoving = false;

        // Check if arrived at target county
        if (army.targetCountyId) {
          const targetCounty = counties.find((c) => c.id === army.targetCountyId);
          if (targetCounty) {
            events.push({
              type: 'army_arrived',
              armyId: army.id,
              ownerId: army.ownerId,
              countyId: army.targetCountyId,
              countyName: targetCounty.name,
            });

            // Check if this county belongs to an enemy we're at war with
            if (targetCounty.holderId && targetCounty.holderId !== army.ownerId) {
              const atWar = wars.some((w) => !w.endDate &&
                ((w.attackerId === army.ownerId && w.defenderId === targetCounty.holderId) ||
                 (w.attackerId === targetCounty.holderId && w.defenderId === army.ownerId)));

              if (atWar) {
                // Start siege if no enemy army present
                army.isSieging = true;
                army.siegeProgress = 0;
                events.push({
                  type: 'siege_started',
                  armyId: army.id,
                  countyId: army.targetCountyId,
                  countyName: targetCounty.name,
                });
              }
            }
          }
        }
      } else {
        army.posX += (dx / dist) * baseSpeed;
        army.posY += (dy / dist) * baseSpeed;
      }
    }

    // Check for army collisions (battles)
    const raisedArmies = armies.filter((a) => a.isRaised);
    for (let i = 0; i < raisedArmies.length; i++) {
      for (let j = i + 1; j < raisedArmies.length; j++) {
        const a = raisedArmies[i];
        const b = raisedArmies[j];
        if (a.ownerId === b.ownerId) continue;

        const dist = Math.sqrt(Math.pow(a.posX - b.posX, 2) + Math.pow(a.posY - b.posY, 2));
        if (dist < 20) {
          // Check if at war
          const war = wars.find((w) => !w.endDate &&
            ((w.attackerId === a.ownerId && w.defenderId === b.ownerId) ||
             (w.attackerId === b.ownerId && w.defenderId === a.ownerId)));

          if (war) {
            const county = this.findNearestCounty(a.posX, a.posY, counties);
            const terrain = county?.terrain || 'plains';
            const attacker = war.attackerId === a.ownerId ? a : b;
            const defender = war.attackerId === a.ownerId ? b : a;
            const atkCmd = characters.find((c) => c.id === attacker.commanderId);
            const defCmd = characters.find((c) => c.id === defender.commanderId);

            const battle = this.resolveBattle(attacker, defender, terrain, atkCmd, defCmd);
            war.warScore += battle.warScoreDelta;
            war.warScore = Math.max(-100, Math.min(100, war.warScore));

            // Stop movement for both armies
            attacker.isMoving = false;
            attacker.isSieging = false;
            defender.isMoving = false;
            defender.isSieging = false;
            attacker.targetX = null;
            attacker.targetY = null;
            defender.targetX = null;
            defender.targetY = null;

            // Loser retreats
            if (battle.winner === 'attacker') {
              defender.posX += (Math.random() - 0.5) * 60;
              defender.posY += (Math.random() - 0.5) * 60;
            } else {
              attacker.posX += (Math.random() - 0.5) * 60;
              attacker.posY += (Math.random() - 0.5) * 60;
            }

            // Disband if army destroyed
            if (this.getTotalTroops(attacker) <= 0) {
              attacker.isRaised = false;
              attacker.levies = 0;
            }
            if (this.getTotalTroops(defender) <= 0) {
              defender.isRaised = false;
              defender.levies = 0;
            }

            events.push({
              type: 'battle',
              warId: war.id,
              location: county?.name || 'Unknown',
              terrain,
              attackerOwnerId: attacker.ownerId,
              defenderOwnerId: defender.ownerId,
              winner: battle.winner,
              attackerCasualties: battle.attackerCasualties,
              defenderCasualties: battle.defenderCasualties,
              warScore: war.warScore,
              phases: battle.phases,
            });

            // Check war resolution
            if (Math.abs(war.warScore) >= 100) {
              events.push(...this.resolveWar(war, characters, counties, allTitles));
            }
          }
        }
      }
    }

    return events;
  }

  /**
   * Process daily siege progress.
   */
  processDailySieges(armies, holdings, counties, wars, allTitles) {
    const events = [];

    for (const army of armies) {
      if (!army.isRaised || !army.isSieging || !army.targetCountyId) continue;

      const county = counties.find((c) => c.id === army.targetCountyId);
      if (!county) { army.isSieging = false; continue; }

      // Find the holding in this county
      const countyHoldings = holdings.filter((h) => {
        return counties.some((c) => c.id === army.targetCountyId);
      });

      // Calculate siege progress
      let siegePower = Math.floor(army.levies / 50);
      for (const maa of (army.menAtArms || [])) {
        if (maa.type === 'siege') siegePower += maa.count * 0.2;
      }

      let fortLevel = 1;
      for (const h of countyHoldings) {
        for (const b of (h.buildings || [])) {
          if (b.buildingKey === 'castle_walls') fortLevel += b.level;
        }
      }

      army.siegeProgress += Math.max(0.5, siegePower / fortLevel);

      if (army.siegeProgress >= 100) {
        // Siege complete - capture county
        const oldHolder = county.holderId;
        county._previousHolder = oldHolder; // Track for war resolution
        county.holderId = army.ownerId;
        army.isSieging = false;
        army.siegeProgress = 0;
        army.targetCountyId = null;

        // Update war score
        const war = wars.find((w) => !w.endDate &&
          ((w.attackerId === army.ownerId && w.defenderId === oldHolder) ||
           (w.attackerId === oldHolder && w.defenderId === army.ownerId)));

        if (war) {
          const isAttacker = war.attackerId === army.ownerId;
          war.warScore += isAttacker ? 15 : -15;
          war.warScore = Math.max(-100, Math.min(100, war.warScore));
        }

        events.push({
          type: 'siege_complete',
          armyId: army.id,
          countyId: county.id,
          countyName: county.name,
          newOwnerId: army.ownerId,
          oldOwnerId: oldHolder,
        });

        if (war && Math.abs(war.warScore) >= 100) {
          events.push(...this.resolveWar(war, [], counties, allTitles));
        }
      }
    }

    return events;
  }

  /**
   * Resolve war end — transfer titles on attacker victory.
   * @param {Object} war
   * @param {Array} characters
   * @param {Array} counties - county-tier titles
   * @param {Array} allTitles - all titles for barony/duchy/kingdom transfers
   */
  resolveWar(war, characters, counties, allTitles) {
    const events = [];
    war.endDate = war.startDate; // Will be set to current day by caller
    const titlesToTransfer = allTitles || counties; // fallback

    if (war.warScore >= 100) {
      war.result = 'attacker_victory';

      // Transfer ALL titles held by defender to attacker (full annexation)
      for (const title of titlesToTransfer) {
        if (title.holderId === war.defenderId) {
          const oldHolder = title.holderId;
          title.holderId = war.attackerId;
          events.push({
            type: 'county_annexed',
            titleId: title.id,
            countyId: title.id,
            countyName: title.name,
            tier: title.tier,
            newOwnerId: war.attackerId,
            oldOwnerId: oldHolder,
          });
        }
      }

      const attackerChar = characters?.find((c) => c.id === war.attackerId);
      const defenderChar = characters?.find((c) => c.id === war.defenderId);
      if (attackerChar) attackerChar.prestige += 200;
      if (defenderChar) defenderChar.prestige -= 100;

    } else if (war.warScore <= -100) {
      war.result = 'defender_victory';

      // Defender reclaims any occupied counties/titles
      for (const title of titlesToTransfer) {
        if (title._previousHolder === war.defenderId && title.holderId === war.attackerId) {
          title.holderId = war.defenderId;
          events.push({
            type: 'county_annexed',
            titleId: title.id,
            countyId: title.id,
            countyName: title.name,
            tier: title.tier,
            newOwnerId: war.defenderId,
            oldOwnerId: war.attackerId,
          });
        }
      }

      const attackerChar = characters?.find((c) => c.id === war.attackerId);
      const defenderChar = characters?.find((c) => c.id === war.defenderId);
      if (attackerChar) attackerChar.prestige -= 200;
      if (defenderChar) defenderChar.prestige += 100;
    }

    events.push({
      type: 'war_ended',
      warId: war.id,
      name: war.name,
      result: war.result,
      attackerId: war.attackerId,
      defenderId: war.defenderId,
    });

    return events;
  }

  /**
   * Resolve a battle between two armies.
   */
  resolveBattle(attackerArmy, defenderArmy, terrain, attackerCommander, defenderCommander) {
    const result = { phases: [], attackerCasualties: 0, defenderCasualties: 0, winner: null, warScoreDelta: 0 };
    const terrainMod = MilitaryEngine.TERRAIN_MODIFIERS[terrain] || { attacker: 1.0, defender: 1.0 };

    let attackPower = this.calculateArmyPower(attackerArmy, 'attack') * terrainMod.attacker;
    let defensePower = this.calculateArmyPower(defenderArmy, 'defense') * terrainMod.defender;

    if (attackerCommander) attackPower *= 1 + (attackerCommander.martial || 0) * 0.02;
    if (defenderCommander) defensePower *= 1 + (defenderCommander.martial || 0) * 0.02;

    // Phase 1: Skirmish
    const skirmDmgDef = this.calculatePhaseDamage(attackerArmy, 'attack', 0.3);
    const skirmDmgAtk = this.calculatePhaseDamage(defenderArmy, 'attack', 0.2);
    result.phases.push({ name: 'Skirmish', attackerLoss: Math.floor(skirmDmgAtk), defenderLoss: Math.floor(skirmDmgDef) });
    this.applyCasualties(attackerArmy, skirmDmgAtk);
    this.applyCasualties(defenderArmy, skirmDmgDef);

    // Phase 2: Melee
    const meleeDmgDef = this.calculatePhaseDamage(attackerArmy, 'attack', 0.6);
    const meleeDmgAtk = this.calculatePhaseDamage(defenderArmy, 'defense', 0.5);
    const counterAtk = this.calculateCounterBonus(attackerArmy, defenderArmy);
    const counterDef = this.calculateCounterBonus(defenderArmy, attackerArmy);
    const totalMeleeDef = meleeDmgDef * (1 + counterAtk);
    const totalMeleeAtk = meleeDmgAtk * (1 + counterDef);
    result.phases.push({ name: 'Melee', attackerLoss: Math.floor(totalMeleeAtk), defenderLoss: Math.floor(totalMeleeDef) });
    this.applyCasualties(attackerArmy, totalMeleeAtk);
    this.applyCasualties(defenderArmy, totalMeleeDef);

    // Phase 3: Pursuit/Retreat
    const atkTotal = this.getTotalTroops(attackerArmy);
    const defTotal = this.getTotalTroops(defenderArmy);
    if (atkTotal > defTotal) {
      result.winner = 'attacker';
      let pursuitDmg = 0;
      for (const maa of (attackerArmy.menAtArms || [])) {
        const t = MilitaryEngine.MAA_TYPES[maa.type];
        if (t) pursuitDmg += maa.count * t.pursuit * 0.01;
      }
      this.applyCasualties(defenderArmy, pursuitDmg);
      result.phases.push({ name: 'Pursuit', attackerLoss: 0, defenderLoss: Math.floor(pursuitDmg) });
    } else {
      result.winner = 'defender';
      let screenDmg = 0;
      for (const maa of (defenderArmy.menAtArms || [])) {
        const t = MilitaryEngine.MAA_TYPES[maa.type];
        if (t) screenDmg += maa.count * t.screen * 0.005;
      }
      this.applyCasualties(attackerArmy, screenDmg);
      result.phases.push({ name: 'Retreat', attackerLoss: Math.floor(screenDmg), defenderLoss: 0 });
    }

    result.attackerCasualties = result.phases.reduce((s, p) => s + p.attackerLoss, 0);
    result.defenderCasualties = result.phases.reduce((s, p) => s + p.defenderLoss, 0);

    const totalTroops = atkTotal + defTotal;
    if (totalTroops > 0) {
      const ratio = result.defenderCasualties / Math.max(1, totalTroops);
      result.warScoreDelta = result.winner === 'attacker'
        ? Math.min(25, Math.floor(ratio * 100))
        : -Math.min(25, Math.floor(result.attackerCasualties / Math.max(1, totalTroops) * 100));
    }

    if (result.winner === 'attacker') {
      attackerArmy.morale = Math.min(1, attackerArmy.morale + 0.1);
      defenderArmy.morale = Math.max(0, defenderArmy.morale - 0.3);
    } else {
      defenderArmy.morale = Math.min(1, defenderArmy.morale + 0.1);
      attackerArmy.morale = Math.max(0, attackerArmy.morale - 0.3);
    }

    return result;
  }

  findNearestCounty(x, y, counties) {
    let nearest = null, minDist = Infinity;
    for (const c of counties) {
      if (c.mapX == null || c.mapY == null) continue;
      const d = Math.sqrt(Math.pow(x - c.mapX, 2) + Math.pow(y - c.mapY, 2));
      if (d < minDist) { minDist = d; nearest = c; }
    }
    return nearest;
  }

  calculateArmyPower(army, stat) {
    let power = army.levies * 1;
    for (const maa of (army.menAtArms || [])) {
      const t = MilitaryEngine.MAA_TYPES[maa.type];
      if (t) power += maa.count * t[stat];
    }
    return power * army.morale;
  }

  calculatePhaseDamage(army, stat, mult) {
    return this.calculateArmyPower(army, stat) * mult * (0.8 + Math.random() * 0.4);
  }

  calculateCounterBonus(army, enemy) {
    let bonus = 0;
    for (const maa of (army.menAtArms || [])) {
      const t = MilitaryEngine.MAA_TYPES[maa.type];
      if (t?.counter) {
        const countered = (enemy.menAtArms || []).find((e) => e.type === t.counter);
        if (countered && countered.count > 0) {
          bonus += 0.25 * (maa.count / Math.max(1, this.getTotalMaA(army)));
        }
      }
    }
    return bonus;
  }

  applyCasualties(army, damage) {
    const total = this.getTotalTroops(army);
    if (total <= 0) return;
    const levyRatio = army.levies / total;
    army.levies = Math.max(0, army.levies - Math.floor(damage * levyRatio));
    const maaRatio = 1 - levyRatio;
    if (maaRatio > 0 && army.menAtArms) {
      const maaTotal = this.getTotalMaA(army);
      for (const maa of army.menAtArms) {
        const unitRatio = maa.count / Math.max(1, maaTotal);
        maa.count = Math.max(0, maa.count - Math.floor(damage * maaRatio * unitRatio));
      }
    }
  }

  getTotalTroops(army) {
    return army.levies + this.getTotalMaA(army);
  }

  getTotalMaA(army) {
    return (army.menAtArms || []).reduce((s, m) => s + m.count, 0);
  }

  calculateArmyMaintenance(army) {
    let cost = army.levies * 0.01;
    for (const maa of (army.menAtArms || [])) {
      const t = MilitaryEngine.MAA_TYPES[maa.type];
      if (t) cost += maa.count * t.cost * 0.01;
    }
    return army.isRaised ? cost * 3 : cost;
  }

  processSiege(army, targetHolding) {
    let siegePower = Math.floor(army.levies / 50);
    for (const maa of (army.menAtArms || [])) {
      if (maa.type === 'siege') siegePower += maa.count * 0.2;
    }
    let fortLevel = 1;
    for (const b of (targetHolding.buildings || [])) {
      if (b.buildingKey === 'castle_walls') fortLevel += b.level;
    }
    return Math.max(0.1, siegePower / fortLevel);
  }
}

module.exports = { MilitaryEngine };
