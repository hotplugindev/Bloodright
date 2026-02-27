const buildingsData = require('../data/buildings.json');

/**
 * EconomyEngine — Handles gold income/expenses, building construction,
 * maintenance costs, and development growth.
 */
class EconomyEngine {
  constructor() {
    this.buildings = buildingsData;
  }

  /**
   * Calculate monthly income for a character from all owned holdings.
   */
  calculateMonthlyIncome(characterId, titles, holdings, allTitles) {
    let totalIncome = 0;
    let totalMaintenance = 0;
    const breakdown = { domain: 0, vassal: 0, maintenance: 0, total: 0 };

    // Direct domain income
    const ownedTitles = titles.filter((t) => t.holderId === characterId && t.tier === 'barony');
    for (const title of ownedTitles) {
      const titleHoldings = holdings.filter((h) => h.titleId === title.id);
      for (const holding of titleHoldings) {
        let income = holding.development * 0.5; // Base income per development

        // Building bonuses
        for (const building of (holding.buildings || [])) {
          const bDef = this.buildings[building.buildingKey];
          if (bDef?.bonuses?.tax) {
            const level = Math.min(building.level, bDef.bonuses.tax.length) - 1;
            if (level >= 0) income += bDef.bonuses.tax[level];
          }

          // Maintenance cost
          if (building.level > 0) {
            totalMaintenance += building.level * 0.1;
          }
        }

        totalIncome += income;
      }
    }
    breakdown.domain = totalIncome;

    // Vassal tax income
    const realmTitles = allTitles.filter((t) => t.holderId === characterId && ['duchy', 'kingdom', 'empire'].includes(t.tier));
    for (const rt of realmTitles) {
      const vassalTitles = allTitles.filter((t) => t.liegeId === rt.id && t.holderId !== characterId);
      for (const vt of vassalTitles) {
        const vassalHoldings = holdings.filter((h) => h.titleId === vt.id);
        for (const vh of vassalHoldings) {
          const vassalIncome = vh.development * 0.5;
          breakdown.vassal += vassalIncome * rt.vassalTaxRate;
        }
      }
    }

    totalIncome += breakdown.vassal;

    // Army maintenance (when raised)
    const armyMaintenance = 0; // Calculated separately in MilitaryEngine

    breakdown.maintenance = totalMaintenance;
    breakdown.total = totalIncome - totalMaintenance;

    return breakdown;
  }

  /**
   * Process building construction progress.
   * Decrements build days and completes buildings when done.
   */
  processDailyConstruction(holdings) {
    const completed = [];

    for (const holding of holdings) {
      for (const building of (holding.buildings || [])) {
        if (building.isBuilding && building.buildDays > 0) {
          building.buildDays--;
          if (building.buildDays <= 0) {
            building.isBuilding = false;
            building.buildDays = 0;
            completed.push({
              holdingId: holding.id,
              buildingKey: building.buildingKey,
              level: building.level,
            });
          }
        }
      }
    }

    return completed;
  }

  /**
   * Start building construction/upgrade.
   */
  startBuilding(holding, buildingKey, currentGold) {
    const bDef = this.buildings[buildingKey];
    if (!bDef) return { success: false, error: 'Unknown building type' };

    const existing = (holding.buildings || []).find((b) => b.buildingKey === buildingKey);
    const nextLevel = existing ? existing.level + 1 : 1;

    if (nextLevel > bDef.maxLevel) {
      return { success: false, error: 'Building already at max level' };
    }

    const cost = bDef.costs[nextLevel - 1];
    const buildDays = bDef.buildDays[nextLevel - 1];

    if (currentGold < cost) {
      return { success: false, error: 'Insufficient gold' };
    }

    if (!existing) {
      return {
        success: true,
        cost,
        newBuilding: {
          holdingId: holding.id,
          buildingKey,
          level: nextLevel,
          isBuilding: true,
          buildDays,
        },
      };
    }

    return {
      success: true,
      cost,
      upgrade: {
        buildingId: existing.id,
        level: nextLevel,
        isBuilding: true,
        buildDays,
      },
    };
  }

  /**
   * Monthly development growth for holdings.
   */
  processMonthlyDevelopment(holdings) {
    for (const holding of holdings) {
      let growthRate = 0.01; // Base monthly growth

      // Building bonuses
      for (const building of (holding.buildings || [])) {
        const bDef = this.buildings[building.buildingKey];
        if (bDef?.bonuses?.development) {
          const level = Math.min(building.level, bDef.bonuses.development.length) - 1;
          if (level >= 0 && !building.isBuilding) {
            growthRate += bDef.bonuses.development[level];
          }
        }
      }

      holding.development += growthRate;
    }
  }

  /**
   * Calculate levy count from holdings and buildings.
   */
  calculateLevies(characterId, titles, holdings) {
    let totalLevies = 0;

    const ownedBaronies = titles.filter((t) => t.holderId === characterId && t.tier === 'barony');
    for (const title of ownedBaronies) {
      const titleHoldings = holdings.filter((h) => h.titleId === title.id);
      for (const holding of titleHoldings) {
        let levies = Math.floor(holding.development * 100);

        for (const building of (holding.buildings || [])) {
          const bDef = this.buildings[building.buildingKey];
          if (bDef?.bonuses?.levies && !building.isBuilding) {
            const level = Math.min(building.level, bDef.bonuses.levies.length) - 1;
            if (level >= 0) levies += bDef.bonuses.levies[level];
          }
        }

        totalLevies += levies;
      }
    }

    return totalLevies;
  }
}

module.exports = { EconomyEngine };
