/**
 * TitleEngine — Handles title hierarchy, succession laws,
 * vassal contract enforcement, and title creation/transfer.
 */
class TitleEngine {
  static TIER_ORDER = { barony: 0, county: 1, duchy: 2, kingdom: 3, empire: 4 };

  /**
   * Resolve succession for a title when the holder dies.
   * Supports: primogeniture, partition, elective.
   */
  resolveTitleSuccession(title, deadHolder, allCharacters, allTitles) {
    const children = allCharacters.filter(
      (c) => c.fatherId === deadHolder.id && c.isAlive
    );

    switch (title.successionLaw) {
      case 'primogeniture':
        return this.primogenitureSuccession(title, children, deadHolder);
      case 'partition':
        return this.partitionSuccession(title, children, deadHolder, allTitles);
      case 'elective':
        return this.electiveSuccession(title, allCharacters, allTitles);
      default:
        return this.primogenitureSuccession(title, children, deadHolder);
    }
  }

  /**
   * Primogeniture: Eldest eligible child inherits all.
   */
  primogenitureSuccession(title, children, deadHolder) {
    if (children.length === 0) {
      // Fall to closest dynasty member
      return null;
    }

    let eligible;
    switch (title.genderLaw) {
      case 'male_preference':
        eligible = children.filter((c) => c.isMale);
        if (eligible.length === 0) eligible = children;
        break;
      case 'female_preference':
        eligible = children.filter((c) => !c.isMale);
        if (eligible.length === 0) eligible = children;
        break;
      case 'equal':
      default:
        eligible = children;
    }

    // Sort by birth date (eldest first)
    eligible.sort((a, b) => a.birthDate - b.birthDate);
    return [{ titleId: title.id, heirId: eligible[0].id }];
  }

  /**
   * Partition: Titles distributed among eligible children.
   * Primary heir gets highest-tier title(s).
   */
  partitionSuccession(title, children, deadHolder, allTitles) {
    if (children.length === 0) return null;

    let eligible = children;
    if (title.genderLaw === 'male_preference') {
      const males = children.filter((c) => c.isMale);
      if (males.length > 0) eligible = males;
    }

    eligible.sort((a, b) => a.birthDate - b.birthDate);

    // Get all titles held by dead holder
    const heldTitles = allTitles
      .filter((t) => t.holderId === deadHolder.id)
      .sort((a, b) => (TitleEngine.TIER_ORDER[b.tier] || 0) - (TitleEngine.TIER_ORDER[a.tier] || 0));

    const assignments = [];
    for (let i = 0; i < heldTitles.length; i++) {
      const heir = eligible[i % eligible.length];
      assignments.push({ titleId: heldTitles[i].id, heirId: heir.id });
    }

    return assignments;
  }

  /**
   * Elective succession: Vassals vote for their preferred candidate.
   * Weighted by opinion and title tier of voter.
   */
  electiveSuccession(title, allCharacters, allTitles) {
    // Find direct vassals
    const vassalTitles = allTitles.filter((t) => t.liegeId === title.id);
    const candidates = [];

    // Candidates: all dynasty members who are alive and adult
    const holderDynasty = title.holder?.dynastyId;
    if (holderDynasty) {
      const dynastyMembers = allCharacters.filter(
        (c) => c.dynastyId === holderDynasty && c.isAlive
      );
      candidates.push(...dynastyMembers);
    }

    // Vassals with strong titles can also be candidates
    for (const vt of vassalTitles) {
      if (vt.holder && !candidates.find((c) => c.id === vt.holder.id)) {
        candidates.push(
          allCharacters.find((c) => c.id === vt.holderId) || vt.holder
        );
      }
    }

    if (candidates.length === 0) return null;

    // Voting
    const votes = {};
    for (const c of candidates) votes[c.id] = 0;

    for (const vt of vassalTitles) {
      if (!vt.holderId) continue;
      const voter = allCharacters.find((c) => c.id === vt.holderId);
      if (!voter) continue;

      // Vote weight based on tier
      const weight = (TitleEngine.TIER_ORDER[vt.tier] || 0) + 1;

      // AI decision: vote for candidate with highest opinion (simplified)
      let bestCandidate = candidates[0];
      let bestScore = -Infinity;
      for (const c of candidates) {
        let score = c.diplomacy + c.prestige / 100;
        if (c.dynastyId === voter.dynastyId) score += 20;
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = c;
        }
      }

      votes[bestCandidate.id] = (votes[bestCandidate.id] || 0) + weight;
    }

    // Winner
    let winnerId = candidates[0].id;
    let maxVotes = 0;
    for (const [cid, v] of Object.entries(votes)) {
      if (v > maxVotes) {
        maxVotes = v;
        winnerId = parseInt(cid);
      }
    }

    return [{ titleId: title.id, heirId: winnerId }];
  }

  /**
   * Calculate vassal obligations (tax and levy contributions).
   */
  calculateVassalObligations(liegeTitle, vassalTitles, holdings) {
    let totalTax = 0;
    let totalLevies = 0;

    for (const vt of vassalTitles) {
      if (vt.liegeId !== liegeTitle.id) continue;

      const vassalHoldings = holdings.filter((h) => {
        const titleMatch = h.titleId === vt.id;
        return titleMatch;
      });

      for (const h of vassalHoldings) {
        const baseTax = h.development * 2;
        const baseLevies = Math.floor(h.development * 100);
        totalTax += baseTax * liegeTitle.vassalTaxRate;
        totalLevies += Math.floor(baseLevies * liegeTitle.vassalLevyRate);
      }
    }

    return { tax: totalTax, levies: totalLevies };
  }

  /**
   * Get realm composition (all titles under a realm title).
   */
  getRealmTitles(realmTitle, allTitles) {
    const result = [realmTitle];
    const queue = [realmTitle.id];

    while (queue.length > 0) {
      const parentId = queue.shift();
      const children = allTitles.filter(
        (t) => t.deJureParentId === parentId || t.liegeId === parentId
      );
      for (const child of children) {
        if (!result.find((r) => r.id === child.id)) {
          result.push(child);
          queue.push(child.id);
        }
      }
    }

    return result;
  }
}

module.exports = { TitleEngine };
