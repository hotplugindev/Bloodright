const traitsData = require('../data/traits.json');

/**
 * CharacterEngine — Handles character lifecycle, stats, traits, genetics,
 * health/death, stress, aging, fertility, and lifestyle skill trees.
 */
class CharacterEngine {
  constructor() {
    this.traitMap = {};
    for (const t of traitsData) {
      this.traitMap[t.key] = t;
    }
  }

  /**
   * Process yearly aging for all living characters.
   */
  processYearlyAging(characters, currentDay) {
    const events = [];
    for (const char of characters) {
      if (!char.isAlive) continue;
      const age = this.getAge(char, currentDay);

      // Health deterioration with age
      if (age > 50) {
        char.health -= 0.1 * ((age - 50) / 10);
      }
      if (age > 65) {
        char.health -= 0.2;
        char.fertility = Math.max(0, char.fertility - 0.1);
      }

      // Fertility decline
      if (!char.isMale && age > 40) {
        char.fertility = Math.max(0, char.fertility - 0.15);
      }

      // Death check
      if (char.health <= 0 || age > 80 + Math.random() * 20) {
        events.push({ type: 'character_death', characterId: char.id, day: currentDay });
        char.isAlive = false;
        char.deathDate = currentDay;
      }

      // Random stress gain for rulers
      if (char.isPlayer || char.heldTitles?.length > 0) {
        char.stress += Math.floor(Math.random() * 5);
        if (char.stress > 100) {
          char.health -= 0.3;
          events.push({ type: 'stress_breakdown', characterId: char.id, day: currentDay });
        }
      }
    }
    return events;
  }

  /**
   * Process monthly lifestyle skill XP gain.
   */
  processMonthlyLifestyle(characters) {
    for (const char of characters) {
      if (!char.isAlive || !char.lifestyleFocus) continue;

      const xp = char.lifestyleXp || { diplomacy: 0, martial: 0, stewardship: 0, intrigue: 0, learning: 0 };
      const baseStat = char[char.lifestyleFocus] || 5;
      xp[char.lifestyleFocus] = (xp[char.lifestyleFocus] || 0) + baseStat * 2;
      char.lifestyleXp = xp;

      // Check for perk unlock (every 500 XP)
      const perks = char.lifestylePerks || [];
      const perkThreshold = (perks.length + 1) * 500;
      if (xp[char.lifestyleFocus] >= perkThreshold) {
        const newPerk = `${char.lifestyleFocus}_perk_${perks.length + 1}`;
        perks.push(newPerk);
        char.lifestylePerks = perks;

        // Perk bonuses
        this.applyLifestylePerkBonus(char, char.lifestyleFocus, perks.length);
      }
    }
  }

  /**
   * Apply lifestyle perk stat bonuses.
   */
  applyLifestylePerkBonus(char, focus, perkLevel) {
    const bonusMap = {
      diplomacy: { diplomacy: 1, prestige: 50 },
      martial: { martial: 1, prowess: 1 },
      stewardship: { stewardship: 1, gold: 25 },
      intrigue: { intrigue: 1, stress: -5 },
      learning: { learning: 1, piety: 25 },
    };
    const bonus = bonusMap[focus];
    if (bonus) {
      for (const [stat, val] of Object.entries(bonus)) {
        if (typeof char[stat] === 'number') {
          char[stat] += val;
        }
      }
    }
  }

  /**
   * Generate a child from two parents with genetic trait inheritance.
   */
  generateChild(father, mother, currentDay) {
    const isMale = Math.random() > 0.5;
    const child = {
      firstName: '', // Will be assigned by name generator
      lastName: father.lastName,
      isMale,
      birthDate: currentDay,
      isAlive: true,
      isPlayer: false,
      diplomacy: this.inheritStat(father.diplomacy, mother.diplomacy),
      martial: this.inheritStat(father.martial, mother.martial),
      stewardship: this.inheritStat(father.stewardship, mother.stewardship),
      intrigue: this.inheritStat(father.intrigue, mother.intrigue),
      learning: this.inheritStat(father.learning, mother.learning),
      prowess: this.inheritStat(father.prowess, mother.prowess),
      health: 5.0 + (Math.random() - 0.5),
      fertility: 0.5,
      stress: 0,
      piety: 0,
      prestige: 0,
      gold: 0,
      fatherId: father.id,
      dynastyId: father.dynastyId,
      cultureId: father.cultureId,
      religionId: father.religionId,
      geneticTraits: this.inheritGeneticTraits(father, mother),
    };
    return child;
  }

  /**
   * Inherit a stat from parents: weighted average + random offset.
   */
  inheritStat(fatherStat, motherStat) {
    const avg = (fatherStat + motherStat) / 2;
    const variation = Math.floor(Math.random() * 5) - 2; // -2 to +2
    return Math.max(1, Math.min(20, Math.round(avg + variation)));
  }

  /**
   * Inherit genetic traits from parents.
   * Each inheritable trait has a ~40% chance to pass to child.
   */
  inheritGeneticTraits(father, mother) {
    const inherited = [];
    const parentTraits = new Set();

    const fatherGenetics = father.geneticTraits || [];
    const motherGenetics = mother.geneticTraits || [];

    for (const traitKey of [...fatherGenetics, ...motherGenetics]) {
      if (parentTraits.has(traitKey)) continue;
      parentTraits.add(traitKey);

      const traitDef = this.traitMap[traitKey];
      if (traitDef && traitDef.inheritable) {
        // Higher chance if both parents have it
        const bothHave = fatherGenetics.includes(traitKey) && motherGenetics.includes(traitKey);
        const chance = bothHave ? 0.7 : 0.4;
        if (Math.random() < chance) {
          inherited.push(traitKey);
        }
      }
    }

    // Small chance of random genetic trait mutation
    if (Math.random() < 0.05) {
      const geneticTraits = traitsData.filter((t) => t.category === 'genetic');
      const mutation = geneticTraits[Math.floor(Math.random() * geneticTraits.length)];
      if (mutation && !inherited.includes(mutation.key)) {
        // Check for opposite trait
        const hasOpposite = inherited.some((t) => mutation.opposites?.includes(t));
        if (!hasOpposite) {
          inherited.push(mutation.key);
        }
      }
    }

    return inherited;
  }

  /**
   * Calculate effective stats including trait modifiers.
   */
  getEffectiveStats(char) {
    const stats = {
      diplomacy: char.diplomacy,
      martial: char.martial,
      stewardship: char.stewardship,
      intrigue: char.intrigue,
      learning: char.learning,
      prowess: char.prowess,
      health: char.health,
      fertility: char.fertility,
    };

    // Apply trait modifiers
    const traitKeys = (char.traits || []).map((t) => t.traitKey || t);
    for (const key of traitKeys) {
      const traitDef = this.traitMap[key];
      if (traitDef?.modifiers) {
        for (const [stat, mod] of Object.entries(traitDef.modifiers)) {
          if (stats[stat] !== undefined) {
            stats[stat] += mod;
          }
        }
      }
    }

    // Apply genetic trait modifiers
    const geneticTraits = char.geneticTraits || [];
    for (const key of geneticTraits) {
      const traitDef = this.traitMap[key];
      if (traitDef?.modifiers) {
        for (const [stat, mod] of Object.entries(traitDef.modifiers)) {
          if (stats[stat] !== undefined) {
            stats[stat] += mod;
          }
        }
      }
    }

    return stats;
  }

  /**
   * Get character age in years from birthdate.
   */
  getAge(char, currentDay) {
    return Math.floor((currentDay - char.birthDate) / 365);
  }

  /**
   * Check fertility and attempt pregnancy between married characters.
   */
  processMonthlyFertility(characters, currentDay) {
    const births = [];
    for (const char of characters) {
      if (!char.isAlive || !char.isMale || !char.spouseId) continue;

      const spouse = characters.find((c) => c.id === char.spouseId);
      if (!spouse || !spouse.isAlive) continue;

      const fatherAge = this.getAge(char, currentDay);
      const motherAge = this.getAge(spouse, currentDay);

      if (fatherAge < 16 || motherAge < 16 || motherAge > 45) continue;

      const chance = char.fertility * spouse.fertility * 0.03; // ~3% per month base
      if (Math.random() < chance) {
        births.push({ father: char, mother: spouse });
      }
    }
    return births;
  }
}

module.exports = { CharacterEngine };
