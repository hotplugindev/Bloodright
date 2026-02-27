const eventsData = require('../data/events.json');

/**
 * EventEngine — JSON-driven event system with conditional triggers,
 * multi-step event chains, and option consequences.
 */
class EventEngine {
  constructor() {
    this.eventDefs = {};
    for (const e of eventsData) {
      this.eventDefs[e.key] = e;
    }
  }

  /**
   * Evaluate trigger conditions for an event on a specific character.
   */
  evaluateConditions(conditions, character, context = {}) {
    for (const cond of conditions) {
      let value;

      switch (cond.field) {
        case 'gold': value = character.gold; break;
        case 'piety': value = character.piety; break;
        case 'prestige': value = character.prestige; break;
        case 'health': value = character.health; break;
        case 'stress': value = character.stress; break;
        case 'age': value = context.age || 0; break;
        case 'diplomacy': value = character.diplomacy; break;
        case 'martial': value = character.martial; break;
        case 'stewardship': value = character.stewardship; break;
        case 'intrigue': value = character.intrigue; break;
        case 'learning': value = character.learning; break;
        case 'is_ruler': value = context.isRuler || false; break;
        case 'is_alive': value = character.isAlive; break;
        case 'vassal_count': value = context.vassalCount || 0; break;
        case 'children_count': value = context.childrenCount || 0; break;
        case 'month': value = context.month || 0; break;
        case 'levies': value = context.levies || 0; break;
        case 'chain_from': value = context.chainFrom || ''; break;
        default: value = character[cond.field];
      }

      if (!this.compareValues(value, cond.op, cond.value)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Compare values with operator.
   */
  compareValues(actual, op, expected) {
    switch (op) {
      case '>=': return actual >= expected;
      case '<=': return actual <= expected;
      case '>': return actual > expected;
      case '<': return actual < expected;
      case '==': return actual === expected;
      case '!=': return actual !== expected;
      default: return false;
    }
  }

  /**
   * Check all defined events for triggerability on a character.
   * Uses MTTH (mean time to happen) for probabilistic triggering.
   */
  checkEvents(character, context, currentDay) {
    const triggeredEvents = [];

    for (const [key, eventDef] of Object.entries(this.eventDefs)) {
      if (!eventDef.trigger) continue;

      // Skip chain events — they're triggered by parent events
      if (eventDef.trigger.conditions?.some((c) => c.field === 'chain_from')) continue;

      // Evaluate conditions
      if (!this.evaluateConditions(eventDef.trigger.conditions || [], character, context)) {
        continue;
      }

      // MTTH check — probability per day
      if (eventDef.trigger.mtth_days) {
        const dailyChance = 1 / eventDef.trigger.mtth_days;
        if (Math.random() > dailyChance) continue;
      }

      triggeredEvents.push({
        eventKey: key,
        characterId: character.id,
        triggerDay: currentDay,
        data: { ...eventDef },
      });
    }

    return triggeredEvents;
  }

  /**
   * Apply chosen option effects to a character.
   */
  applyOptionEffects(character, option, context = {}) {
    const results = [];

    for (const effect of (option.effects || [])) {
      // Handle chance-based effects
      if (effect.chance !== undefined && Math.random() > effect.chance) {
        continue;
      }

      switch (effect.type) {
        case 'modify_gold':
          character.gold = Math.max(0, (character.gold || 0) + effect.value);
          results.push({ type: 'gold', value: effect.value });
          break;

        case 'modify_prestige':
          character.prestige = (character.prestige || 0) + effect.value;
          results.push({ type: 'prestige', value: effect.value });
          break;

        case 'modify_piety':
          character.piety = (character.piety || 0) + effect.value;
          results.push({ type: 'piety', value: effect.value });
          break;

        case 'modify_stress':
          character.stress = Math.max(0, Math.min(100, (character.stress || 0) + effect.value));
          results.push({ type: 'stress', value: effect.value });
          break;

        case 'modify_health':
          character.health = Math.max(0, (character.health || 5) + effect.value);
          results.push({ type: 'health', value: effect.value });
          break;

        case 'modify_vassal_opinion':
          results.push({ type: 'vassal_opinion', value: effect.value, duration: effect.duration_days });
          break;

        case 'modify_development':
          results.push({ type: 'development', value: effect.value });
          break;

        case 'add_trait':
          results.push({ type: 'add_trait', trait: effect.value });
          break;

        case 'add_relationship':
          results.push({ type: 'add_relationship', relType: effect.rel_type });
          break;

        case 'start_scheme':
          results.push({ type: 'start_scheme', schemeType: effect.scheme_type, target: effect.target });
          break;

        case 'prevent_faction':
          results.push({ type: 'prevent_faction', target: effect.target });
          break;

        case 'modify_diplomacy_xp':
        case 'modify_martial_xp':
        case 'modify_stewardship_xp':
        case 'modify_intrigue_xp':
        case 'modify_learning_xp':
          const skill = effect.type.replace('modify_', '').replace('_xp', '');
          const xp = character.lifestyleXp || {};
          xp[skill] = (xp[skill] || 0) + effect.value;
          character.lifestyleXp = xp;
          results.push({ type: 'xp', skill, value: effect.value });
          break;

        case 'modify_innovation_progress':
          results.push({ type: 'innovation_progress', value: effect.value });
          break;

        case 'modify_child_opinion':
          results.push({ type: 'child_opinion', value: effect.value, target: effect.target });
          break;
      }
    }

    return results;
  }

  /**
   * Get the next event in a chain.
   */
  getChainedEvent(eventKey) {
    const eventDef = this.eventDefs[eventKey];
    if (eventDef?.chain?.next_event) {
      const nextDef = this.eventDefs[eventDef.chain.next_event];
      return {
        eventKey: eventDef.chain.next_event,
        delayDays: eventDef.chain.delay_days || 30,
        eventDef: nextDef,
      };
    }
    return null;
  }

  /**
   * Get event definition by key.
   */
  getEventDef(key) {
    return this.eventDefs[key] || null;
  }
}

module.exports = { EventEngine };
