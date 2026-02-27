/**
 * AIEngine — Decision weighting for non-player characters.
 * Drives autonomous behavior: war declarations, marriage, schemes,
 * lifestyle focus, and diplomatic actions.
 */
class AIEngine {
  /**
   * AI personality archetypes derived from traits.
   */
  static PERSONALITY_WEIGHTS = {
    brave: { war: 1.5, scheme: 0.5, diplomacy: 0.8 },
    craven: { war: 0.3, scheme: 1.2, diplomacy: 1.5 },
    ambitious: { war: 1.3, scheme: 1.5, diplomacy: 1.0 },
    content: { war: 0.4, scheme: 0.3, diplomacy: 1.2 },
    generous: { war: 0.7, scheme: 0.3, diplomacy: 1.5 },
    greedy: { war: 1.0, scheme: 1.3, diplomacy: 0.6 },
    just: { war: 0.8, scheme: 0.2, diplomacy: 1.3 },
    arbitrary: { war: 1.2, scheme: 1.2, diplomacy: 0.5 },
    zealous: { war: 1.4, scheme: 0.7, diplomacy: 0.8 },
    cynical: { war: 0.8, scheme: 1.3, diplomacy: 1.0 },
    patient: { war: 0.5, scheme: 0.8, diplomacy: 1.3 },
    wrathful: { war: 1.8, scheme: 1.0, diplomacy: 0.3 },
    diligent: { war: 0.9, scheme: 0.7, diplomacy: 1.0 },
    lazy: { war: 0.3, scheme: 0.3, diplomacy: 0.5 },
  };

  /**
   * Get AI personality weights from character traits.
   */
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
   * Decide whether an AI ruler should declare war.
   */
  shouldDeclareWar(character, target, militaryPowerRatio, personality) {
    // Base threshold: need 1.5x military power to consider war
    let threshold = 1.5;

    // Personality adjustments
    threshold /= personality.war;

    // Stat bonuses
    threshold -= character.martial * 0.02;

    // Opinion effects: very negative opinion increases war desire
    const opinion = character._opinionOfTarget || 0;
    if (opinion < -50) threshold -= 0.3;
    if (opinion < -75) threshold -= 0.3;

    // Claims increase desire
    if (character._hasClaim) threshold -= 0.5;

    return militaryPowerRatio >= threshold;
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

    // AI picks their highest stat (with some randomness)
    const entries = Object.entries(stats).map(([key, val]) => ({
      key,
      score: val + Math.random() * 5,
    }));

    entries.sort((a, b) => b.score - a.score);
    return entries[0].key;
  }

  /**
   * Decide AI scheme target and type.
   */
  chooseScheme(character, potentialTargets, personality) {
    if (personality.scheme < 0.5) return null; // Low scheme inclination
    if (character.intrigue < 8) return null; // Too dumb to scheme

    // Filter to valid targets
    const targets = potentialTargets.filter((t) => {
      if (t.id === character.id) return false;
      if (!t.isAlive) return false;
      if (t.dynastyId === character.dynastyId) return false; // Don't scheme against family (usually)
      return true;
    });

    if (targets.length === 0) return null;

    // Score each target
    let bestTarget = null;
    let bestScore = -Infinity;
    let bestType = 'murder';

    for (const target of targets) {
      let score = 0;

      // High-value targets (rulers with titles you want)
      if (target._titleCount > 0) score += target._titleCount * 10;

      // Low opinion increases murder desire
      const opinion = target._opinionOf?.[character.id] || 0;
      if (opinion < -30) score += 10;
      if (opinion < -60) score += 20;

      // Rival relationship
      if (target._isRival) score += 30;

      // Scale by intrigue stat difference
      score *= character.intrigue / Math.max(1, target.intrigue);
      score *= personality.scheme;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = target;

        // Choose type based on context
        if (score > 50) bestType = 'murder';
        else if (character.intrigue > 12) bestType = 'fabricate_claim';
        else bestType = 'seduce';
      }
    }

    // Only scheme if score is high enough
    if (bestScore < 15) return null;

    return { targetId: bestTarget.id, type: bestType, score: bestScore };
  }

  /**
   * AI marriage partner evaluation.
   */
  evaluateMarriagePartner(character, candidate, personality) {
    let score = 0;

    // Alliance value
    score += (candidate._titleCount || 0) * 15;

    // Stats value
    score += (candidate.diplomacy || 0) * 2;
    score += (candidate.stewardship || 0) * 1;

    // Fertility
    score += (candidate.fertility || 0) * 30;

    // Same culture/religion bonus
    if (character.cultureId === candidate.cultureId) score += 15;
    if (character.religionId === candidate.religionId) score += 20;

    // Diplomatic personality prefers alliance marriages
    score *= personality.diplomacy;

    return score;
  }

  /**
   * Process all AI decisions for a tick.
   */
  processAIDecisions(characters, allTitles, currentDay) {
    const actions = [];

    for (const char of characters) {
      if (!char.isAlive || char.isPlayer) continue;

      const personality = this.getPersonalityWeights(char);
      const heldTitles = allTitles.filter((t) => t.holderId === char.id);

      // Only rulers make strategic decisions
      if (heldTitles.length === 0) continue;

      // Choose lifestyle if not set
      if (!char.lifestyleFocus) {
        char.lifestyleFocus = this.chooseLifestyleFocus(char);
        actions.push({ type: 'set_lifestyle', characterId: char.id, focus: char.lifestyleFocus });
      }

      // Periodic AI check (not every tick — roughly monthly)
      if (currentDay % 30 !== char.id % 30) continue;

      // Scheme decision
      const neighbors = characters.filter((c) => c.isAlive && c.id !== char.id);
      const scheme = this.chooseScheme(char, neighbors, personality);
      if (scheme) {
        actions.push({ type: 'start_scheme', characterId: char.id, ...scheme });
      }
    }

    return actions;
  }
}

module.exports = { AIEngine };
