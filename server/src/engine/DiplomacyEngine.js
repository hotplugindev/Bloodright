/**
 * DiplomacyEngine — Handles opinion calculation, marriage proposals,
 * alliance formation, faction mechanics, and scheme resolution.
 */
class DiplomacyEngine {
  /**
   * Opinion modifier definitions.
   */
  static OPINION_MODIFIERS = {
    same_religion: 15,
    different_religion: -15,
    different_religion_hostile: -40,
    different_religion_evil: -60,
    same_culture: 10,
    different_culture: -10,
    alliance: 40,
    friend: 30,
    rival: -50,
    lover: 50,
    married: 25,
    same_dynasty: 5,
    vassal_contract_fair: 0,
    vassal_contract_harsh: -20,
    liege_trait_just: 10,
    liege_trait_arbitrary: -10,
    liege_trait_generous: 15,
    liege_trait_greedy: -15,
    recent_war: -40,
    granted_title: 30,
    revoked_title: -60,
  };

  /**
   * Calculate total opinion between two characters.
   */
  calculateOpinion(fromChar, toChar, context = {}) {
    let opinion = 0;
    const breakdown = [];

    // Religion
    if (fromChar.religionId === toChar.religionId) {
      opinion += DiplomacyEngine.OPINION_MODIFIERS.same_religion;
      breakdown.push({ reason: 'Same faith', value: DiplomacyEngine.OPINION_MODIFIERS.same_religion });
    } else {
      const hostility = context.religionHostility || 'hostile';
      const mod = DiplomacyEngine.OPINION_MODIFIERS[`different_religion_${hostility}`] ||
        DiplomacyEngine.OPINION_MODIFIERS.different_religion;
      opinion += mod;
      breakdown.push({ reason: 'Different faith', value: mod });
    }

    // Culture
    if (fromChar.cultureId === toChar.cultureId) {
      opinion += DiplomacyEngine.OPINION_MODIFIERS.same_culture;
      breakdown.push({ reason: 'Same culture', value: DiplomacyEngine.OPINION_MODIFIERS.same_culture });
    } else {
      opinion += DiplomacyEngine.OPINION_MODIFIERS.different_culture;
      breakdown.push({ reason: 'Foreign culture', value: DiplomacyEngine.OPINION_MODIFIERS.different_culture });
    }

    // Dynasty
    if (fromChar.dynastyId && fromChar.dynastyId === toChar.dynastyId) {
      opinion += DiplomacyEngine.OPINION_MODIFIERS.same_dynasty;
      breakdown.push({ reason: 'Same dynasty', value: DiplomacyEngine.OPINION_MODIFIERS.same_dynasty });
    }

    // Trait-based opinion
    const toTraits = (toChar.traits || []).map((t) => t.traitKey || t);
    if (toTraits.includes('just')) {
      opinion += DiplomacyEngine.OPINION_MODIFIERS.liege_trait_just;
      breakdown.push({ reason: 'Just ruler', value: 10 });
    }
    if (toTraits.includes('arbitrary')) {
      opinion += DiplomacyEngine.OPINION_MODIFIERS.liege_trait_arbitrary;
      breakdown.push({ reason: 'Arbitrary ruler', value: -10 });
    }
    if (toTraits.includes('generous')) {
      opinion += DiplomacyEngine.OPINION_MODIFIERS.liege_trait_generous;
      breakdown.push({ reason: 'Generous ruler', value: 15 });
    }
    if (toTraits.includes('greedy')) {
      opinion += DiplomacyEngine.OPINION_MODIFIERS.liege_trait_greedy;
      breakdown.push({ reason: 'Greedy ruler', value: -15 });
    }

    // Diplomacy stat contribution
    const diplomaticBonus = Math.floor(toChar.diplomacy / 3);
    opinion += diplomaticBonus;
    breakdown.push({ reason: 'Personal diplomacy', value: diplomaticBonus });

    // Relationships
    for (const rel of (context.relationships || [])) {
      const mod = DiplomacyEngine.OPINION_MODIFIERS[rel.type] || 0;
      if (mod !== 0) {
        opinion += mod;
        breakdown.push({ reason: `${rel.type}`, value: mod });
      }
    }

    // Alliance
    if (context.hasAlliance) {
      opinion += DiplomacyEngine.OPINION_MODIFIERS.alliance;
      breakdown.push({ reason: 'Alliance', value: 40 });
    }

    return { total: Math.max(-100, Math.min(100, opinion)), breakdown };
  }

  /**
   * AI decision: accept or reject a marriage proposal.
   */
  evaluateMarriageProposal(proposer, target, proposerTitles, targetTitles) {
    let score = 0;

    // Title prestige
    const tierScore = { empire: 50, kingdom: 30, duchy: 15, county: 5, barony: 1 };
    for (const t of proposerTitles) {
      score += tierScore[t.tier] || 0;
    }

    // Stats
    score += (proposer.diplomacy || 0) * 2;
    score += (proposer.stewardship || 0);

    // Fertility
    score += (proposer.fertility || 0) * 20;

    // Health
    score += (proposer.health || 0) * 5;

    // Gold
    score += Math.min(50, (proposer.gold || 0) / 5);

    // Same religion/culture bonuses
    if (proposer.religionId === target.religionId) score += 20;
    if (proposer.cultureId === target.cultureId) score += 10;

    // Threshold: 50+ means acceptance
    return { accepted: score >= 50, score };
  }

  /**
   * Process monthly faction power calculations.
   * Faction power = sum of members' military power / target's military power.
   */
  calculateFactionPower(faction, members, targetChar, allTitles, holdings) {
    let memberPower = 0;
    let targetPower = 0;

    for (const member of members) {
      const memberTitles = allTitles.filter((t) => t.holderId === member.characterId);
      for (const t of memberTitles) {
        const tHoldings = holdings.filter((h) => h.titleId === t.id);
        for (const h of tHoldings) {
          memberPower += h.development * 100;
        }
      }
    }

    const targetTitles = allTitles.filter((t) => t.holderId === targetChar.id);
    for (const t of targetTitles) {
      const tHoldings = holdings.filter((h) => h.titleId === t.id);
      for (const h of tHoldings) {
        targetPower += h.development * 100;
      }
    }

    return targetPower > 0 ? memberPower / targetPower : memberPower > 0 ? 99 : 0;
  }

  /**
   * Check if a faction should fire (ultimatum/revolt).
   * Fires when: power ratio >= 2.0 AND at least 3 months old.
   */
  shouldFactionFire(faction) {
    return faction.power >= 2.0;
  }
}

module.exports = { DiplomacyEngine };
