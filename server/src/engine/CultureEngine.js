const culturesData = require('../data/cultures.json');

/**
 * CultureEngine — Handles innovation progress, culture dominance,
 * cultural bonuses, and innovation unlocking.
 */
class CultureEngine {
  constructor() {
    this.cultureDefs = {};
    for (const c of culturesData) {
      this.cultureDefs[c.key] = c;
    }
  }

  /**
   * Process monthly innovation progress for cultures.
   * Progress based on total development of counties with that culture.
   */
  processMonthlyInnovation(cultures, counties, characters) {
    const unlocked = [];

    for (const culture of cultures) {
      const def = this.cultureDefs[culture.key];
      if (!def?.innovationTree) continue;

      // Calculate development of counties with this culture
      const cultureCharIds = characters
        .filter((c) => c.cultureId === culture.id && c.isAlive)
        .map((c) => c.id);

      let totalDevelopment = 0;
      for (const county of counties) {
        if (cultureCharIds.includes(county.holderId)) {
          totalDevelopment += county.development || 1;
        }
      }

      // Scholarly rulers boost innovation
      const scholars = characters.filter(
        (c) => c.cultureId === culture.id && c.isAlive && (c.learning || 0) >= 12
      );
      const scholarBonus = scholars.length * 0.1;

      const progress = culture.innovationProgress || {};
      const currentInnovations = culture.innovations || [];

      // Progress each available innovation
      for (const innovation of def.innovationTree) {
        if (currentInnovations.includes(innovation.key)) continue;

        // Check prerequisites
        if (innovation.requires) {
          const hasAll = innovation.requires.every((req) => currentInnovations.includes(req));
          if (!hasAll) continue;
        }

        // Monthly progress
        const monthlyGain = (totalDevelopment * 0.05 + scholarBonus) / (innovation.cost || 100);
        progress[innovation.key] = (progress[innovation.key] || 0) + monthlyGain;

        // Check if unlocked (100% progress)
        if (progress[innovation.key] >= 1.0) {
          currentInnovations.push(innovation.key);
          delete progress[innovation.key];
          unlocked.push({ cultureId: culture.id, innovation: innovation.key });
        }
      }

      culture.innovationProgress = progress;
      culture.innovations = currentInnovations;
    }

    return unlocked;
  }

  /**
   * Calculate culture dominance for a county.
   * Dominant culture gets bonuses in that county.
   */
  calculateDominance(countyId, characters) {
    const cultureCount = {};

    for (const char of characters) {
      if (!char.isAlive || !char.cultureId) continue;
      // Count characters of each culture who hold titles in/around this county
      cultureCount[char.cultureId] = (cultureCount[char.cultureId] || 0) + 1;
    }

    let dominantCulture = null;
    let maxCount = 0;
    for (const [cultureId, count] of Object.entries(cultureCount)) {
      if (count > maxCount) {
        maxCount = count;
        dominantCulture = parseInt(cultureId);
      }
    }

    return { dominantCulture, distribution: cultureCount };
  }

  /**
   * Get all bonuses for a culture (base + unlocked innovations).
   */
  getCultureBonuses(culture) {
    const def = this.cultureDefs[culture.key];
    if (!def) return {};

    const bonuses = { ...(def.bonuses || {}) };
    const currentInnovations = culture.innovations || [];

    for (const innovation of (def.innovationTree || [])) {
      if (currentInnovations.includes(innovation.key) && innovation.bonuses) {
        for (const [key, val] of Object.entries(innovation.bonuses)) {
          bonuses[key] = (bonuses[key] || 0) + val;
        }
      }
    }

    return bonuses;
  }

  /**
   * Get innovation tree with progress for UI display.
   */
  getInnovationTreeStatus(culture) {
    const def = this.cultureDefs[culture.key];
    if (!def?.innovationTree) return [];

    const progress = culture.innovationProgress || {};
    const currentInnovations = culture.innovations || [];

    return def.innovationTree.map((innovation) => ({
      ...innovation,
      unlocked: currentInnovations.includes(innovation.key),
      progress: progress[innovation.key] || 0,
      available: innovation.requires
        ? innovation.requires.every((req) => currentInnovations.includes(req))
        : true,
    }));
  }
}

module.exports = { CultureEngine };
