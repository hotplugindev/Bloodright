const traitsData = require('../data/traits.json');

/**
 * PopulationEngine — Manages county inhabitants: birth, death,
 * aging, trait inheritance, role assignments, marriage to rulers,
 * and succession through children.
 */
class PopulationEngine {
  constructor() {
    this.personalityTraits = traitsData.filter((t) => t.category === 'personality').map((t) => t.key);

    this.maleNames = [
      'Aldric', 'Beorn', 'Caden', 'Darius', 'Edric', 'Frej', 'Gareth', 'Harald',
      'Ivar', 'Jorund', 'Kael', 'Leoric', 'Magnus', 'Njord', 'Osric', 'Perrin',
      'Ragnar', 'Sigmund', 'Theron', 'Ulfric', 'Varen', 'Willem', 'Xander', 'Yorick',
      'Zarek', 'Alaric', 'Baldric', 'Cedric', 'Dorian', 'Edmund', 'Florian', 'Gideon',
    ];
    this.femaleNames = [
      'Astrid', 'Brenna', 'Cordelia', 'Dahlia', 'Elara', 'Freya', 'Gwendolyn',
      'Helga', 'Isolde', 'Jora', 'Katarina', 'Lyria', 'Maelis', 'Nessa', 'Ophelia',
      'Petra', 'Rosalind', 'Sigrid', 'Thea', 'Vivienne', 'Willow', 'Zelda', 'Aria',
    ];
    this.lastNames = [
      'Smith', 'Miller', 'Cooper', 'Fletcher', 'Tanner', 'Baker', 'Mason',
      'Carter', 'Hunter', 'Fisher', 'Weaver', 'Thatcher', 'Shepherd', 'Gardner',
      'Carpenter', 'Porter', 'Brewer', 'Chandler', 'Mercer', 'Dyer',
    ];
  }

  /**
   * Generate initial population for a county.
   * Creates 8-15 inhabitants per county with varied ages and traits.
   */
  generateCountyPopulation(countyId, savegameId, currentDay) {
    const count = 8 + Math.floor(Math.random() * 8);
    const population = [];

    for (let i = 0; i < count; i++) {
      const isMale = Math.random() > 0.5;
      const age = 16 + Math.floor(Math.random() * 45); // 16-60
      const traits = [];

      // Each person gets 1-2 personality traits
      const numTraits = 1 + Math.floor(Math.random() * 2);
      const available = [...this.personalityTraits];
      for (let j = 0; j < numTraits && available.length > 0; j++) {
        const idx = Math.floor(Math.random() * available.length);
        traits.push(available.splice(idx, 1)[0]);
      }

      population.push({
        savegameId,
        countyId,
        firstName: isMale
          ? this.maleNames[Math.floor(Math.random() * this.maleNames.length)]
          : this.femaleNames[Math.floor(Math.random() * this.femaleNames.length)],
        lastName: this.lastNames[Math.floor(Math.random() * this.lastNames.length)],
        isMale,
        birthDate: currentDay - age * 365,
        isAlive: true,
        martial: 1 + Math.floor(Math.random() * 8),
        stewardship: 1 + Math.floor(Math.random() * 8),
        intrigue: 1 + Math.floor(Math.random() * 8),
        learning: 1 + Math.floor(Math.random() * 8),
        prowess: 1 + Math.floor(Math.random() * 8),
        health: 3.0 + Math.random() * 4,
        fertility: 0.2 + Math.random() * 0.5,
        traits,
        role: null,
        spouseId: null,
        spouseType: null,
        fatherId: null,
        motherId: null,
      });
    }

    // Pair up some inhabitants as spouses
    const unmarried = population.filter((p) => !p.spouseId);
    const males = unmarried.filter((p) => p.isMale);
    const females = unmarried.filter((p) => !p.isMale);
    const pairs = Math.min(males.length, females.length, Math.floor(count / 3));

    for (let i = 0; i < pairs; i++) {
      // We'll use temporary indices since IDs aren't assigned yet
      // Spouses will be linked after DB insert
      males[i]._spouseIdx = population.indexOf(females[i]);
      females[i]._spouseIdx = population.indexOf(males[i]);
    }

    return population;
  }

  /**
   * Process yearly aging for all population.
   * Inhabitants age, die naturally, and children grow up.
   */
  processYearlyAging(populations, currentDay) {
    const events = [];
    for (const pop of populations) {
      if (!pop.isAlive) continue;
      const age = Math.floor((currentDay - pop.birthDate) / 365);

      // Health deterioration with age
      if (age > 45) {
        pop.health -= 0.15 * ((age - 45) / 10);
      }
      if (age > 60) {
        pop.health -= 0.3;
        pop.fertility = Math.max(0, pop.fertility - 0.15);
      }

      // Women lose fertility faster
      if (!pop.isMale && age > 38) {
        pop.fertility = Math.max(0, pop.fertility - 0.2);
      }

      // Death check
      if (pop.health <= 0 || age > 65 + Math.random() * 25) {
        pop.isAlive = false;
        pop.deathDate = currentDay;
        events.push({
          type: 'population_death',
          populationId: pop.id,
          countyId: pop.countyId,
          name: `${pop.firstName} ${pop.lastName}`,
          age,
          role: pop.role,
        });
      }
    }
    return events;
  }

  /**
   * Process monthly fertility for population.
   * Married pairs can produce children.
   */
  processMonthlyFertility(populations, currentDay) {
    const births = [];

    for (const pop of populations) {
      if (!pop.isAlive || !pop.isMale || !pop.spouseId || pop.spouseType === 'character') continue;

      const spouse = populations.find((p) => p.id === pop.spouseId);
      if (!spouse || !spouse.isAlive) continue;

      const fatherAge = Math.floor((currentDay - pop.birthDate) / 365);
      const motherAge = Math.floor((currentDay - spouse.birthDate) / 365);

      if (fatherAge < 16 || motherAge < 16 || motherAge > 43) continue;

      const chance = pop.fertility * spouse.fertility * 0.02;
      if (Math.random() < chance) {
        births.push({ father: pop, mother: spouse, countyId: pop.countyId });
      }
    }

    return births;
  }

  /**
   * Generate a child from two population parents.
   */
  generateChild(father, mother, currentDay) {
    const isMale = Math.random() > 0.5;

    // Inherit traits from parents
    const parentTraits = [...(father.traits || []), ...(mother.traits || [])];
    const childTraits = [];
    const seen = new Set();
    for (const t of parentTraits) {
      if (seen.has(t)) continue;
      seen.add(t);
      if (Math.random() < 0.35) {
        childTraits.push(t);
      }
    }
    // Random new trait chance
    if (Math.random() < 0.3 && this.personalityTraits.length > 0) {
      const newTrait = this.personalityTraits[Math.floor(Math.random() * this.personalityTraits.length)];
      if (!childTraits.includes(newTrait)) childTraits.push(newTrait);
    }

    return {
      savegameId: father.savegameId,
      countyId: father.countyId,
      firstName: isMale
        ? this.maleNames[Math.floor(Math.random() * this.maleNames.length)]
        : this.femaleNames[Math.floor(Math.random() * this.femaleNames.length)],
      lastName: father.lastName,
      isMale,
      birthDate: currentDay,
      isAlive: true,
      martial: this.inheritStat(father.martial, mother.martial),
      stewardship: this.inheritStat(father.stewardship, mother.stewardship),
      intrigue: this.inheritStat(father.intrigue, mother.intrigue),
      learning: this.inheritStat(father.learning, mother.learning),
      prowess: this.inheritStat(father.prowess, mother.prowess),
      health: 4.0 + Math.random() * 2,
      fertility: 0.3 + Math.random() * 0.4,
      traits: childTraits,
      role: null,
      spouseId: null,
      spouseType: null,
      fatherId: father.id,
      motherId: mother.id,
    };
  }

  /**
   * Generate child between a ruler (Character) and a population spouse.
   * Returns a new Character object (the heir inherits as a Character).
   */
  generateRulerChild(ruler, populationSpouse, currentDay) {
    const isMale = Math.random() > 0.5;
    const names = isMale ? this.maleNames : this.femaleNames;
    return {
      firstName: names[Math.floor(Math.random() * names.length)],
      lastName: ruler.lastName,
      isMale,
      birthDate: currentDay,
      isAlive: true,
      isPlayer: false,
      savegameId: ruler.savegameId,
      diplomacy: this.inheritStat(ruler.diplomacy, populationSpouse.stewardship || 5),
      martial: this.inheritStat(ruler.martial, populationSpouse.martial),
      stewardship: this.inheritStat(ruler.stewardship, populationSpouse.stewardship),
      intrigue: this.inheritStat(ruler.intrigue, populationSpouse.intrigue),
      learning: this.inheritStat(ruler.learning, populationSpouse.learning),
      prowess: this.inheritStat(ruler.prowess, populationSpouse.prowess),
      health: 5.0 + (Math.random() - 0.5),
      fertility: 0.5,
      stress: 0,
      piety: 0,
      prestige: 0,
      gold: 0,
      fatherId: ruler.isMale ? ruler.id : null,
      dynastyId: ruler.dynastyId,
      cultureId: ruler.cultureId,
      religionId: ruler.religionId,
      geneticTraits: ruler.geneticTraits || [],
    };
  }

  inheritStat(a, b) {
    const avg = (a + b) / 2;
    const variation = Math.floor(Math.random() * 5) - 2;
    return Math.max(1, Math.min(15, Math.round(avg + variation)));
  }

  /**
   * Auto-marry unmarried population adults.
   * Runs monthly to pair singles in the same county.
   */
  processMonthlyMarriages(populations, currentDay) {
    const marriages = [];
    // Group by county
    const byCounty = {};
    for (const p of populations) {
      if (!p.isAlive || p.spouseId) continue;
      const age = Math.floor((currentDay - p.birthDate) / 365);
      if (age < 16) continue;
      if (!byCounty[p.countyId]) byCounty[p.countyId] = { males: [], females: [] };
      if (p.isMale) byCounty[p.countyId].males.push(p);
      else byCounty[p.countyId].females.push(p);
    }

    for (const countyId of Object.keys(byCounty)) {
      const { males, females } = byCounty[countyId];
      const pairs = Math.min(males.length, females.length);
      for (let i = 0; i < pairs; i++) {
        if (Math.random() < 0.1) { // 10% chance per month for an eligible pair
          males[i].spouseId = females[i].id;
          males[i].spouseType = 'population';
          females[i].spouseId = males[i].id;
          females[i].spouseType = 'population';
          marriages.push({ male: males[i], female: females[i], countyId: parseInt(countyId) });
        }
      }
    }

    return marriages;
  }

  /**
   * Find best candidates for court roles in a ruler's counties.
   */
  findBestForRole(populations, countyIds, role) {
    const eligible = populations.filter((p) =>
      p.isAlive && countyIds.includes(p.countyId) && !p.role
    );

    const statMap = {
      marshal: 'martial',
      steward: 'stewardship',
      spymaster: 'intrigue',
      chancellor: 'stewardship', // Could also be learning
      court_physician: 'learning',
      knight: 'prowess',
    };

    const stat = statMap[role] || 'martial';
    eligible.sort((a, b) => (b[stat] || 0) - (a[stat] || 0));
    return eligible.slice(0, 5);
  }

  /**
   * Find eligible marriage candidates for a ruler from their population.
   */
  findMarriageCandidates(populations, countyIds, ruler, currentDay) {
    return populations.filter((p) => {
      if (!p.isAlive || p.spouseId) return false;
      if (!countyIds.includes(p.countyId)) return false;
      const age = Math.floor((currentDay - p.birthDate) / 365);
      if (age < 16) return false;
      // Opposite gender by default (can be changed)
      if (p.isMale === ruler.isMale) return false;
      return true;
    }).sort((a, b) => {
      // Sort by total stats
      const aTotal = (a.martial || 0) + (a.stewardship || 0) + (a.intrigue || 0) + (a.learning || 0) + (a.prowess || 0);
      const bTotal = (b.martial || 0) + (b.stewardship || 0) + (b.intrigue || 0) + (b.learning || 0) + (b.prowess || 0);
      return bTotal - aTotal;
    });
  }

  /**
   * Get age of a population member.
   */
  getAge(pop, currentDay) {
    return Math.floor((currentDay - pop.birthDate) / 365);
  }
}

module.exports = { PopulationEngine };
