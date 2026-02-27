/**
 * MilitaryEngine — Handles army composition, combat resolution,
 * siege warfare, war score tracking, and commander effects.
 */
class MilitaryEngine {
  /**
   * Men-at-arms type definitions.
   */
  static MAA_TYPES = {
    pikemen: { attack: 10, defense: 18, toughness: 15, pursuit: 0, screen: 10, counter: 'cavalry', cost: 1.5 },
    archers: { attack: 14, defense: 4, toughness: 8, pursuit: 0, screen: 6, counter: 'pikemen', cost: 1.0 },
    cavalry: { attack: 18, defense: 8, toughness: 12, pursuit: 30, screen: 0, counter: 'archers', cost: 3.0 },
    siege: { attack: 2, defense: 2, toughness: 5, pursuit: 0, screen: 0, siegeBonus: 20, cost: 4.0 },
  };

  /**
   * Terrain combat modifiers.
   */
  static TERRAIN_MODIFIERS = {
    plains: { attacker: 1.0, defender: 1.0 },
    hills: { attacker: 0.85, defender: 1.15 },
    mountains: { attacker: 0.7, defender: 1.4 },
    forest: { attacker: 0.8, defender: 1.2 },
    desert: { attacker: 0.9, defender: 0.95 },
    coast: { attacker: 0.95, defender: 1.05 },
    marsh: { attacker: 0.75, defender: 1.1 },
  };

  /**
   * Resolve a battle between two armies.
   * Three phases: Skirmish, Melee, Pursuit.
   * Returns battle result with casualties and war score delta.
   */
  resolveBattle(attackerArmy, defenderArmy, terrain, attackerCommander, defenderCommander) {
    const result = {
      phases: [],
      attackerCasualties: 0,
      defenderCasualties: 0,
      winner: null,
      warScoreDelta: 0,
    };

    const terrainMod = MilitaryEngine.TERRAIN_MODIFIERS[terrain] || { attacker: 1.0, defender: 1.0 };

    // Calculate total combat power
    let attackPower = this.calculateArmyPower(attackerArmy, 'attack') * terrainMod.attacker;
    let defensePower = this.calculateArmyPower(defenderArmy, 'defense') * terrainMod.defender;

    // Commander bonuses
    if (attackerCommander) {
      attackPower *= 1 + (attackerCommander.martial || 0) * 0.02;
    }
    if (defenderCommander) {
      defensePower *= 1 + (defenderCommander.martial || 0) * 0.02;
    }

    // ─── Phase 1: Skirmish (ranged combat) ───
    const skirmishDamageToDefender = this.calculatePhaseDamage(attackerArmy, 'attack', 0.3);
    const skirmishDamageToAttacker = this.calculatePhaseDamage(defenderArmy, 'attack', 0.2);
    result.phases.push({
      name: 'Skirmish',
      attackerLoss: Math.floor(skirmishDamageToAttacker),
      defenderLoss: Math.floor(skirmishDamageToDefender),
    });

    // Apply skirmish casualties
    this.applyCasualties(attackerArmy, skirmishDamageToAttacker);
    this.applyCasualties(defenderArmy, skirmishDamageToDefender);

    // ─── Phase 2: Melee (main combat) ───
    const meleeDamageToDefender = this.calculatePhaseDamage(attackerArmy, 'attack', 0.6);
    const meleeDamageToAttacker = this.calculatePhaseDamage(defenderArmy, 'defense', 0.5);

    // Counter bonuses
    const counterBonusAtk = this.calculateCounterBonus(attackerArmy, defenderArmy);
    const counterBonusDef = this.calculateCounterBonus(defenderArmy, attackerArmy);

    const totalMeleeDamageToDefender = meleeDamageToDefender * (1 + counterBonusAtk);
    const totalMeleeDamageToAttacker = meleeDamageToAttacker * (1 + counterBonusDef);

    result.phases.push({
      name: 'Melee',
      attackerLoss: Math.floor(totalMeleeDamageToAttacker),
      defenderLoss: Math.floor(totalMeleeDamageToDefender),
    });

    this.applyCasualties(attackerArmy, totalMeleeDamageToAttacker);
    this.applyCasualties(defenderArmy, totalMeleeDamageToDefender);

    // ─── Phase 3: Pursuit ───
    const attackerTotal = this.getTotalTroops(attackerArmy);
    const defenderTotal = this.getTotalTroops(defenderArmy);

    // Determine winner
    if (attackerTotal > defenderTotal) {
      result.winner = 'attacker';
      // Pursuit: cavalry excels
      let pursuitDamage = 0;
      for (const maa of (attackerArmy.menAtArms || [])) {
        const type = MilitaryEngine.MAA_TYPES[maa.type];
        if (type) pursuitDamage += maa.count * type.pursuit * 0.01;
      }
      this.applyCasualties(defenderArmy, pursuitDamage);
      result.phases.push({ name: 'Pursuit', attackerLoss: 0, defenderLoss: Math.floor(pursuitDamage) });
    } else {
      result.winner = 'defender';
      // Screen: pikemen protect retreating forces
      let screenDamage = 0;
      for (const maa of (defenderArmy.menAtArms || [])) {
        const type = MilitaryEngine.MAA_TYPES[maa.type];
        if (type) screenDamage += maa.count * type.screen * 0.005;
      }
      this.applyCasualties(attackerArmy, screenDamage);
      result.phases.push({ name: 'Retreat', attackerLoss: Math.floor(screenDamage), defenderLoss: 0 });
    }

    // Total casualties
    result.attackerCasualties = result.phases.reduce((sum, p) => sum + p.attackerLoss, 0);
    result.defenderCasualties = result.phases.reduce((sum, p) => sum + p.defenderLoss, 0);

    // War score from battle (based on casualties and army size)
    const totalTroops = attackerTotal + defenderTotal;
    if (totalTroops > 0) {
      const casualtyRatio = result.defenderCasualties / Math.max(1, totalTroops);
      result.warScoreDelta = result.winner === 'attacker'
        ? Math.min(25, Math.floor(casualtyRatio * 100))
        : -Math.min(25, Math.floor(result.attackerCasualties / Math.max(1, totalTroops) * 100));
    }

    // Morale impact
    if (result.winner === 'attacker') {
      attackerArmy.morale = Math.min(1.0, attackerArmy.morale + 0.1);
      defenderArmy.morale = Math.max(0, defenderArmy.morale - 0.3);
    } else {
      defenderArmy.morale = Math.min(1.0, defenderArmy.morale + 0.1);
      attackerArmy.morale = Math.max(0, attackerArmy.morale - 0.3);
    }

    return result;
  }

  /**
   * Calculate army combat power in a specific stat.
   */
  calculateArmyPower(army, stat) {
    let power = army.levies * 1; // Levies have base 1 power

    for (const maa of (army.menAtArms || [])) {
      const type = MilitaryEngine.MAA_TYPES[maa.type];
      if (type) power += maa.count * type[stat];
    }

    return power * army.morale;
  }

  /**
   * Calculate phase-specific damage.
   */
  calculatePhaseDamage(army, stat, multiplier) {
    const power = this.calculateArmyPower(army, stat);
    return power * multiplier * (0.8 + Math.random() * 0.4); // 80-120% variance
  }

  /**
   * Calculate counter bonus (rock-paper-scissors).
   */
  calculateCounterBonus(army, enemy) {
    let bonus = 0;
    for (const maa of (army.menAtArms || [])) {
      const type = MilitaryEngine.MAA_TYPES[maa.type];
      if (type?.counter) {
        const countered = (enemy.menAtArms || []).find((e) => e.type === type.counter);
        if (countered && countered.count > 0) {
          bonus += 0.25 * (maa.count / Math.max(1, this.getTotalMaA(army)));
        }
      }
    }
    return bonus;
  }

  /**
   * Apply casualties to an army, distributing proportionally.
   */
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

  /**
   * Get total troops in an army.
   */
  getTotalTroops(army) {
    return army.levies + this.getTotalMaA(army);
  }

  getTotalMaA(army) {
    return (army.menAtArms || []).reduce((sum, maa) => sum + maa.count, 0);
  }

  /**
   * Calculate army monthly maintenance cost.
   */
  calculateArmyMaintenance(army) {
    let cost = army.levies * 0.01;
    for (const maa of (army.menAtArms || [])) {
      const type = MilitaryEngine.MAA_TYPES[maa.type];
      if (type) cost += maa.count * type.cost * 0.01;
    }
    return army.isRaised ? cost * 3 : cost; // 3x cost when raised
  }

  /**
   * Process siege: daily progress against holdings.
   */
  processSiege(army, targetHolding) {
    let siegePower = Math.floor(army.levies / 50); // 1 progress per 50 levies

    // Siege equipment bonus
    for (const maa of (army.menAtArms || [])) {
      if (maa.type === 'siege') {
        const type = MilitaryEngine.MAA_TYPES.siege;
        siegePower += maa.count * (type.siegeBonus / 100);
      }
    }

    // Fort level resistance
    let fortLevel = 1;
    for (const b of (targetHolding.buildings || [])) {
      if (b.buildingKey === 'castle_walls') {
        fortLevel += b.level;
      }
    }

    const dailyProgress = Math.max(0.1, siegePower / fortLevel);
    return dailyProgress; // 100% = siege complete
  }
}

module.exports = { MilitaryEngine };
