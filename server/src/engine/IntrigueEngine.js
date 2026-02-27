/**
 * IntrigueEngine — Handles scheme creation, secrecy, discovery mechanics,
 * and probability-based resolution.
 */
class IntrigueEngine {
  /**
   * Scheme type definitions with base power, secrecy decay, and success thresholds.
   */
  static SCHEME_TYPES = {
    murder: {
      name: 'Murder',
      basePower: 5,
      baseSecrecyDecay: 3,
      successThreshold: 95,
      discoveryPenalty: { prestige: -200, opinion: -50, stress: 30 },
    },
    seduce: {
      name: 'Seduce',
      basePower: 8,
      baseSecrecyDecay: 2,
      successThreshold: 80,
      discoveryPenalty: { prestige: -50, opinion: -20, stress: 10 },
    },
    fabricate_claim: {
      name: 'Fabricate Claim',
      basePower: 3,
      baseSecrecyDecay: 1,
      successThreshold: 100,
      discoveryPenalty: { prestige: -100, opinion: -30 },
    },
    abduct: {
      name: 'Abduct',
      basePower: 4,
      baseSecrecyDecay: 4,
      successThreshold: 90,
      discoveryPenalty: { prestige: -150, opinion: -40, stress: 20 },
    },
  };

  /**
   * Process monthly scheme progress for all active schemes.
   */
  processMonthlySchemes(schemes, characters) {
    const events = [];

    for (const scheme of schemes) {
      if (!scheme.isActive) continue;

      const owner = characters.find((c) => c.id === scheme.ownerId);
      const target = characters.find((c) => c.id === scheme.targetId);
      if (!owner || !target || !owner.isAlive || !target.isAlive) {
        scheme.isActive = false;
        continue;
      }

      const typeDef = IntrigueEngine.SCHEME_TYPES[scheme.type];
      if (!typeDef) continue;

      // Calculate scheme power (owner intrigue vs target intrigue)
      const ownerIntrigue = owner.intrigue || 5;
      const targetIntrigue = target.intrigue || 5;

      // Monthly progress
      const powerRatio = ownerIntrigue / Math.max(1, targetIntrigue);
      const monthlyProgress = (typeDef.basePower + ownerIntrigue * 0.5) * powerRatio;
      scheme.progress = Math.min(scheme.progress + monthlyProgress, typeDef.successThreshold);

      // Secrecy decay
      const secrecyDecay = typeDef.baseSecrecyDecay + (targetIntrigue * 0.3);
      scheme.secrecy = Math.max(0, scheme.secrecy - secrecyDecay);

      // Discovery check
      if (scheme.secrecy <= 0) {
        events.push({
          type: 'scheme_discovered',
          schemeId: scheme.id,
          ownerId: scheme.ownerId,
          targetId: scheme.targetId,
          schemeType: scheme.type,
        });
        scheme.isActive = false;
        continue;
      }

      // Monthly discovery chance (increases as secrecy drops)
      const discoveryChance = (100 - scheme.secrecy) * 0.005; // 0-50% chance at 0-100 secrecy
      if (Math.random() < discoveryChance) {
        events.push({
          type: 'scheme_discovered',
          schemeId: scheme.id,
          ownerId: scheme.ownerId,
          targetId: scheme.targetId,
          schemeType: scheme.type,
        });
        scheme.isActive = false;
        continue;
      }

      // Success check
      if (scheme.progress >= typeDef.successThreshold) {
        // Final success roll (based on remaining secrecy)
        const successChance = 0.5 + (scheme.secrecy / 200); // 50-100%
        if (Math.random() < successChance) {
          events.push({
            type: 'scheme_success',
            schemeId: scheme.id,
            ownerId: scheme.ownerId,
            targetId: scheme.targetId,
            schemeType: scheme.type,
          });
        } else {
          events.push({
            type: 'scheme_failed',
            schemeId: scheme.id,
            ownerId: scheme.ownerId,
            targetId: scheme.targetId,
            schemeType: scheme.type,
          });
        }
        scheme.isActive = false;
      }
    }

    return events;
  }

  /**
   * Apply scheme success effects.
   */
  applySchemeSuccess(scheme, owner, target) {
    const effects = [];

    switch (scheme.type) {
      case 'murder':
        target.isAlive = false;
        target.health = 0;
        effects.push({ type: 'character_death', characterId: target.id, cause: 'murder' });
        owner.stress += 20;
        break;

      case 'seduce':
        effects.push({ type: 'add_relationship', fromId: owner.id, toId: target.id, relType: 'lover' });
        owner.stress -= 10;
        break;

      case 'fabricate_claim':
        effects.push({ type: 'add_claim', characterId: owner.id, targetId: target.id });
        break;

      case 'abduct':
        effects.push({ type: 'imprison', characterId: target.id, jailerId: owner.id });
        break;
    }

    return effects;
  }

  /**
   * Apply discovery penalties.
   */
  applyDiscoveryPenalty(scheme, owner) {
    const typeDef = IntrigueEngine.SCHEME_TYPES[scheme.type];
    if (!typeDef) return;

    const penalty = typeDef.discoveryPenalty;
    if (penalty.prestige) owner.prestige += penalty.prestige;
    if (penalty.stress) owner.stress += penalty.stress;

    return penalty;
  }

  /**
   * Calculate initial scheme power based on participants.
   */
  calculateSchemePower(owner, agents = []) {
    let power = owner.intrigue * 5;

    for (const agent of agents) {
      power += (agent.intrigue || 0) * 2;
    }

    return power;
  }
}

module.exports = { IntrigueEngine };
