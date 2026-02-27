/**
 * DynastyEngine — Handles renown accumulation, cadet branches,
 * dynasty head succession, and perk unlocking.
 */
class DynastyEngine {
  /**
   * Dynasty perks available for unlocking.
   */
  static PERKS = {
    // Kin tier
    'kin_prestige': { name: 'Esteemed Blood', cost: 500, bonuses: { prestige_gain: 0.1 } },
    'kin_fertility': { name: 'Bountiful Line', cost: 500, bonuses: { fertility: 0.1 } },
    'kin_health': { name: 'Resilient Stock', cost: 750, bonuses: { health: 0.3 } },
    // Glory tier
    'glory_opinion': { name: 'Illustrious Name', cost: 1000, bonuses: { vassal_opinion: 5 } },
    'glory_martial': { name: 'Warlike Heritage', cost: 1000, bonuses: { martial: 1 } },
    'glory_diplomacy': { name: 'Diplomatic Legacy', cost: 1000, bonuses: { diplomacy: 1 } },
    // Legacy tier
    'legacy_stewardship': { name: 'Prosperous Realm', cost: 1500, bonuses: { stewardship: 2 } },
    'legacy_intrigue': { name: 'Shadow Dynasty', cost: 1500, bonuses: { intrigue: 2 } },
    'legacy_learning': { name: 'Scholarly Tradition', cost: 1500, bonuses: { learning: 2 } },
    // Blood tier
    'blood_strong': { name: 'Blood of Heroes', cost: 2000, bonuses: { prowess: 3, genetic_chance: 0.1 } },
    'blood_genius': { name: 'Genius Bloodline', cost: 3000, bonuses: { learning: 3, genetic_chance: 0.15 } },
  };

  /**
   * Calculate monthly renown for a dynasty based on living titled members.
   */
  calculateMonthlyRenown(dynasty, members, allTitles) {
    let renown = 0;

    for (const member of members) {
      if (!member.isAlive) continue;

      // Find titles held by this member
      const heldTitles = allTitles.filter((t) => t.holderId === member.id);

      for (const title of heldTitles) {
        switch (title.tier) {
          case 'empire': renown += 2.0; break;
          case 'kingdom': renown += 1.0; break;
          case 'duchy': renown += 0.5; break;
          case 'county': renown += 0.2; break;
          case 'barony': renown += 0.05; break;
        }
      }

      // Living members without titles still contribute slightly
      if (heldTitles.length === 0) {
        renown += 0.02;
      }
    }

    // Dynasty head bonus
    if (dynasty.headId) {
      renown *= 1.1;
    }

    return renown;
  }

  /**
   * Process dynasty head succession when the current head dies.
   * Rules: Highest-tier title holder in the dynasty becomes new head.
   * Ties broken by prestige, then age (oldest first).
   */
  succeedDynastyHead(dynasty, members, allTitles) {
    const tierOrder = { empire: 5, kingdom: 4, duchy: 3, county: 2, barony: 1 };

    const livingMembers = members.filter((m) => m.isAlive);
    if (livingMembers.length === 0) return null;

    let bestCandidate = null;
    let bestTier = 0;
    let bestPrestige = -Infinity;

    for (const member of livingMembers) {
      const heldTitles = allTitles.filter((t) => t.holderId === member.id);
      let highestTier = 0;
      for (const t of heldTitles) {
        const tier = tierOrder[t.tier] || 0;
        if (tier > highestTier) highestTier = tier;
      }

      if (
        highestTier > bestTier ||
        (highestTier === bestTier && member.prestige > bestPrestige)
      ) {
        bestCandidate = member;
        bestTier = highestTier;
        bestPrestige = member.prestige;
      }
    }

    return bestCandidate;
  }

  /**
   * Check if a cadet branch should be created.
   * Triggers when a non-head dynasty member holds a kingdom+ title.
   */
  checkCadetBranch(dynasty, members, allTitles) {
    const branches = [];

    for (const member of members) {
      if (!member.isAlive || member.id === dynasty.headId) continue;

      const heldTitles = allTitles.filter((t) => t.holderId === member.id);
      const hasHighTitle = heldTitles.some((t) => t.tier === 'kingdom' || t.tier === 'empire');

      if (hasHighTitle) {
        branches.push({
          founderId: member.id,
          name: `${member.lastName}-${member.firstName}`,
          parentDynastyId: dynasty.id,
        });
      }
    }

    return branches;
  }

  /**
   * Apply dynasty perk bonuses to all members.
   */
  getDynastyBonuses(dynasty) {
    const bonuses = {};
    const perks = dynasty.perks || [];

    for (const perkKey of perks) {
      const perk = DynastyEngine.PERKS[perkKey];
      if (perk?.bonuses) {
        for (const [key, val] of Object.entries(perk.bonuses)) {
          bonuses[key] = (bonuses[key] || 0) + val;
        }
      }
    }

    return bonuses;
  }
}

module.exports = { DynastyEngine };
