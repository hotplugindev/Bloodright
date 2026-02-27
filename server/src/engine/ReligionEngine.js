const religionsData = require('../data/religions.json');

/**
 * ReligionEngine — Handles piety accumulation, doctrine enforcement,
 * religious hostility, fervor mechanics, and holy war eligibility.
 */
class ReligionEngine {
  constructor() {
    this.religionDefs = {};
    for (const r of religionsData) {
      this.religionDefs[r.key] = r;
    }
  }

  /**
   * Monthly piety accumulation from buildings, traits, and doctrine adherence.
   */
  calculateMonthlyPiety(character, holdings, buildings) {
    let piety = 0;

    // Base: learning stat contribution
    piety += (character.learning || 0) * 0.1;

    // Zealous trait bonus
    const traits = (character.traits || []).map((t) => t.traitKey || t);
    if (traits.includes('zealous')) piety += 1.0;
    if (traits.includes('cynical')) piety -= 0.5;

    // Temple holdings
    for (const h of holdings) {
      if (h.type === 'temple') {
        piety += h.development * 0.3;

        for (const b of (h.buildings || [])) {
          if (b.buildingKey === 'monastery') {
            piety += b.level * 0.5;
          }
          if (b.buildingKey === 'pilgrim_road') {
            piety += b.level * 0.3;
          }
        }
      }
    }

    return piety;
  }

  /**
   * Get hostility level between two religions.
   * Returns: 'righteous' | 'hostile' | 'evil'
   */
  getHostility(religion1Key, religion2Key) {
    if (religion1Key === religion2Key) return 'righteous';

    const def = this.religionDefs[religion1Key];
    if (def?.hostility && def.hostility[religion2Key]) {
      return def.hostility[religion2Key];
    }

    // Default: hostile to different religions
    return 'hostile';
  }

  /**
   * Check if a character can declare a holy war.
   * Requirements: different hostile/evil religion, minimum piety, fervor threshold.
   */
  canDeclareHolyWar(attacker, defender, attackerReligion) {
    // Must be different religions
    if (attacker.religionId === defender.religionId) return { eligible: false, reason: 'Same faith' };

    // Check hostility
    const hostility = this.getHostility(attackerReligion?.key, defender.religion?.key);
    if (hostility === 'righteous') return { eligible: false, reason: 'Righteous faith, cannot declare holy war' };

    // Minimum piety
    const pietyCost = hostility === 'evil' ? 250 : 500;
    if (attacker.piety < pietyCost) {
      return { eligible: false, reason: `Need ${pietyCost} piety (have ${Math.floor(attacker.piety)})` };
    }

    // Fervor check
    if (attackerReligion && attackerReligion.fervor < 25) {
      return { eligible: false, reason: 'Religious fervor too low' };
    }

    return { eligible: true, pietyCost };
  }

  /**
   * Process monthly fervor changes.
   * Fervor decreases with lost holy wars, increases with won holy wars and events.
   */
  processMonthlyFervor(religions, wars) {
    for (const religion of religions) {
      // Natural drift toward 50
      if (religion.fervor > 50) {
        religion.fervor -= 0.5;
      } else if (religion.fervor < 50) {
        religion.fervor += 0.5;
      }

      // Holy war effects
      for (const war of wars) {
        if (war.casusBelli !== 'holy_war') continue;
        if (war.result === 'attacker_victory') {
          // Winner's religion gains fervor
          religion.fervor = Math.min(100, religion.fervor + 5);
        }
        if (war.result === 'defender_victory') {
          religion.fervor = Math.max(0, religion.fervor - 10);
        }
      }

      religion.fervor = Math.max(0, Math.min(100, religion.fervor));
    }
  }

  /**
   * Check doctrine compliance for a character.
   * Returns violations if character breaks religious doctrines.
   */
  checkDoctrineCompliance(character, religion) {
    const violations = [];
    const doctrines = religion.doctrines || [];

    if (doctrines.includes('monogamy') && character.spouseOf?.length > 1) {
      violations.push({ doctrine: 'monogamy', penalty: { piety: -50, opinion: -10 } });
    }

    if (doctrines.includes('pacifism')) {
      // Check if character is at war
      // (simplified: handled at higher level)
      violations.push({ doctrine: 'pacifism', penalty: { piety: -30, opinion: -5 }, condition: 'at_war' });
    }

    return violations;
  }

  /**
   * Tenet bonuses for religion.
   */
  getTenetBonuses(religion) {
    const bonuses = {};
    const tenets = religion.tenets || [];

    const tenetEffects = {
      divine_right: { prestige_gain: 0.2, vassal_opinion: 5 },
      just_war: { war_score_gain: 0.1, martial: 1 },
      communal_charity: { vassal_opinion: 10, tax_penalty: -0.05 },
      astral_communion: { learning: 2, stress_loss: 5 },
      ritual_dance: { fertility: 0.05, stress_loss: 10 },
      prophecy: { intrigue: 1, scheme_power: 0.1 },
      ancestor_veneration: { dynasty_opinion: 10, prestige_gain: 0.1 },
      sacred_groves: { development_growth: 0.05, defender_advantage: 0.1 },
      blood_offerings: { martial: 2, piety_gain: 0.2 },
      sacred_contracts: { stewardship: 1, vassal_opinion: 5 },
      wealth_virtue: { tax_income: 0.1, gold_per_month: 0.5 },
      hospitality: { diplomacy: 2, opinion: 5 },
      trial_by_combat: { prowess: 2, martial: 1 },
      valor_in_death: { morale: 0.1, levy_size: 0.1 },
      sacred_arms: { maa_damage: 0.1, prowess: 1 },
    };

    for (const tenet of tenets) {
      if (tenetEffects[tenet]) {
        for (const [key, val] of Object.entries(tenetEffects[tenet])) {
          bonuses[key] = (bonuses[key] || 0) + val;
        }
      }
    }

    return bonuses;
  }
}

module.exports = { ReligionEngine };
