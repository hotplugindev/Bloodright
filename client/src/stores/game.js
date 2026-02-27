import { defineStore } from 'pinia';

export const useGameStore = defineStore('game', {
  state: () => ({
    gameDate: 0,
    characters: [],
    titles: [],
    dynasties: [],
    religions: [],
    cultures: [],
    wars: [],
    armies: [],
    holdings: [],
    schemes: [],
    alliances: [],
    populations: [],
    focuses: {},
    selectedCharacterId: null,
    selectedTitleId: null,
    selectedArmyId: null,
    playerCharacterId: null,
    activePanel: null,
    pendingEvents: [],
    notifications: [],
    isPaused: true,
    tickSpeed: 1,
    armyMoveMode: false,
    difficulty: 'normal',
  }),

  getters: {
    selectedCharacter: (state) => state.characters.find((c) => c.id === state.selectedCharacterId),
    playerCharacter: (state) => state.characters.find((c) => c.id === state.playerCharacterId),
    playerCharacters: (state) => state.characters.filter((c) => c.isPlayer && c.isAlive),
    livingCharacters: (state) => state.characters.filter((c) => c.isAlive),
    counties: (state) => state.titles.filter((t) => t.tier === 'county'),
    formattedDate: (state) => {
      const year = Math.floor(state.gameDate / 365) + 1;
      const dayOfYear = state.gameDate % 365;
      const month = Math.floor(dayOfYear / 30) + 1;
      const day = (dayOfYear % 30) + 1;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${months[month - 1] || 'Jan'} ${year}`;
    },
    selectedCharacterHoldings: (state) => {
      if (!state.selectedCharacterId) return [];
      const ownedTitleIds = state.titles
        .filter((t) => t.holderId === state.selectedCharacterId)
        .map((t) => t.id);
      return state.holdings.filter((h) => ownedTitleIds.includes(h.titleId));
    },
    playerPopulations: (state) => {
      if (!state.playerCharacterId) return [];
      const playerCountyIds = state.titles
        .filter((t) => t.holderId === state.playerCharacterId && t.tier === 'county')
        .map((t) => t.id);
      return state.populations.filter((p) => p.isAlive && playerCountyIds.includes(p.countyId));
    },
    playerRulerFocus: (state) => {
      const pc = state.characters.find((c) => c.id === state.playerCharacterId);
      return pc?.rulerFocus || null;
    },
    selectedArmy: (state) => state.armies.find((a) => a.id === state.selectedArmyId),
  },

  actions: {
    loadGameState(data) {
      this.gameDate = data.gameDate || 0;
      this.characters = data.characters || [];
      this.titles = data.titles || [];
      this.dynasties = data.dynasties || [];
      this.religions = data.religions || [];
      this.cultures = data.cultures || [];
      this.wars = data.wars || [];
      this.armies = data.armies || [];
      this.holdings = data.holdings || [];
      this.schemes = data.schemes || [];
      this.alliances = data.alliances || [];
      this.populations = data.populations || [];
      this.focuses = data.focuses || {};
      this.difficulty = data.difficulty || 'normal';
      if (data.playerCharacterId) {
        this.playerCharacterId = data.playerCharacterId;
        this.selectedCharacterId = data.playerCharacterId;
        const char = this.characters.find((c) => c.id === data.playerCharacterId);
        if (char) char.isPlayer = true;
      }
    },

    applyTick(tickData) {
      this.gameDate = tickData.gameDate;
      const updates = tickData.updates || {};
      if (updates.characterUpdates) {
        for (const upd of updates.characterUpdates) {
          const char = this.characters.find((c) => c.id === upd.id);
          if (char) {
            if (upd.gold !== undefined) char.gold = upd.gold;
            if (upd.prestige !== undefined) char.prestige = upd.prestige;
            if (upd.piety !== undefined) char.piety = upd.piety;
            if (upd.health !== undefined) char.health = upd.health;
            if (upd.stress !== undefined) char.stress = upd.stress;
            if (upd.isAlive !== undefined) char.isAlive = upd.isAlive;
            if (upd.rulerFocus !== undefined) char.rulerFocus = upd.rulerFocus;
            if (upd.fertility !== undefined) char.fertility = upd.fertility;
            if (upd.spouseId !== undefined) char.spouseId = upd.spouseId;
            if (upd.deathDate !== undefined) char.deathDate = upd.deathDate;
            if (upd.isPlayer !== undefined) char.isPlayer = upd.isPlayer;
          } else {
            // New character (born during gameplay) — add to list
            this.characters.push(upd);
          }
        }
      }
      if (updates.armyUpdates) {
        for (const upd of updates.armyUpdates) {
          const idx = this.armies.findIndex((a) => a.id === upd.id);
          if (idx >= 0) this.armies[idx] = { ...this.armies[idx], ...upd };
          else this.armies.push(upd); // New army (e.g. AI raised)
        }
        // Remove disbanded armies that are no longer in updates
        const activeIds = new Set(updates.armyUpdates.map((a) => a.id));
        this.armies = this.armies.filter((a) => activeIds.has(a.id) || a.isRaised);
      }
      if (updates.armyPositions) {
        for (const pos of updates.armyPositions) {
          const army = this.armies.find((a) => a.id === pos.id);
          if (army) {
            army.posX = pos.posX;
            army.posY = pos.posY;
            army.isMoving = pos.isMoving;
            army.isSieging = pos.isSieging;
            army.siegeProgress = pos.siegeProgress;
          }
        }
      }
      if (updates.titleUpdates) {
        for (const tUpd of updates.titleUpdates) {
          const title = this.titles.find((t) => t.id === tUpd.id);
          if (title) title.holderId = tUpd.holderId;
        }
      }
      if (updates.warUpdates) {
        for (const wUpd of updates.warUpdates) {
          const existing = this.wars.find((w) => w.id === wUpd.id);
          if (existing) {
            existing.warScore = wUpd.warScore;
            if (wUpd.endDate) existing.endDate = wUpd.endDate;
            if (wUpd.result) existing.result = wUpd.result;
          } else {
            this.wars.push(wUpd); // New war (e.g. AI declared)
          }
        }
      }
      const events = tickData.events || [];
      for (const ev of events) {
        if (ev.type === 'battle') {
          this.addNotification({ type: 'error', message: `⚔️ Battle at ${ev.location}! ${ev.winner === 'attacker' ? 'Attacker' : 'Defender'} wins!` });
        } else if (ev.type === 'siege_complete') {
          // County was captured during siege
          const title = this.titles.find((t) => t.id === ev.countyId);
          if (title) title.holderId = ev.newOwnerId;
          this.addNotification({ type: 'warning', message: `🏰 ${ev.countyName} captured!` });
        } else if (ev.type === 'county_annexed') {
          // Title transferred from war resolution
          const title = this.titles.find((t) => t.id === (ev.titleId || ev.countyId));
          if (title) title.holderId = ev.newOwnerId;
          this.addNotification({ type: 'warning', message: `📜 ${ev.countyName} annexed!` });
        } else if (ev.type === 'war_ended') {
          const resultText = ev.result === 'attacker_victory' ? 'Attacker Victory' : 'Defender Victory';
          this.addNotification({ type: 'info', message: `⚔️ War ended: ${resultText}` });
          const war = this.wars.find((w) => w.id === ev.warId);
          if (war) {
            war.endDate = this.gameDate;
            war.result = ev.result;
          }
        } else if (ev.type === 'war_declared') {
          if (ev.war) this.addWar(ev.war);
          this.addNotification({ type: 'error', message: `⚔️ War: ${ev.war?.name || 'A war has started!'}` });
        } else if (ev.type === 'siege_started') {
          this.addNotification({ type: 'warning', message: `🏰 Siege of ${ev.countyName} begun!` });
        } else if (ev.type === 'birth' && ev.child) {
          const exists = this.characters.find((c) => c.id === ev.child.id);
          if (!exists) this.characters.push(ev.child);
          if (ev.fatherId === this.playerCharacterId || ev.motherId === this.playerCharacterId) {
            this.addNotification({ type: 'success', message: `👶 A ${ev.child.isMale ? 'son' : 'daughter'} has been born: ${ev.child.firstName}!` });
          }
        } else if (ev.type === 'title_inherited') {
          const title = this.titles.find((t) => t.id === ev.titleId);
          if (title) title.holderId = ev.heirId;
          this.addNotification({ type: 'info', message: '👑 Title inherited' });
        } else if (ev.type === 'character_death') {
          const dead = this.characters.find((c) => c.id === ev.characterId);
          if (dead) {
            dead.isAlive = false;
            dead.deathDate = this.gameDate;
          }
          this.addNotification({ type: 'info', message: `💀 ${ev.name || 'A character'} has died` });
        } else if (ev.type === 'player_heir_succession') {
          // Player ruler died — switch to heir
          if (ev.deadRulerId === this.playerCharacterId) {
            this.playerCharacterId = ev.heirId;
            this.selectedCharacterId = ev.heirId;
            const heir = this.characters.find((c) => c.id === ev.heirId);
            if (heir) heir.isPlayer = true;
            const dead = this.characters.find((c) => c.id === ev.deadRulerId);
            if (dead) dead.isPlayer = false;
            this.addNotification({ type: 'warning', message: `👑 Your ruler has died! You now play as ${ev.heirName}` });
          }
        } else if (ev.type === 'ai_raise_army' || ev.type === 'ai_move_army' || ev.type === 'ai_disband_army') {
          // Silent AI events — don't notify player
        }
      }
    },

    selectCharacter(id) {
      this.selectedCharacterId = id;
      this.activePanel = 'character';
    },

    selectTitle(id) {
      this.selectedTitleId = id;
      this.activePanel = 'realm';
    },

    selectArmy(id) {
      this.selectedArmyId = id;
      this.armyMoveMode = true;
    },

    cancelArmyMove() {
      this.armyMoveMode = false;
      this.selectedArmyId = null;
    },

    setPanel(panel) { this.activePanel = panel; },
    closePanel() { this.activePanel = null; },

    addNotification(notification) {
      this.notifications.unshift({ id: Date.now(), ...notification, timestamp: new Date() });
      if (this.notifications.length > 50) this.notifications.pop();
    },

    setPendingEvents(events) { this.pendingEvents = events; },
    clearEvent(eventKey) { this.pendingEvents = this.pendingEvents.filter((e) => e.eventKey !== eventKey); },

    addWar(war) {
      const exists = this.wars.find((w) => w.id === war.id);
      if (!exists) this.wars.push(war);
    },

    addScheme(scheme) { this.schemes.push(scheme); },

    updateArmy(armyData) {
      const idx = this.armies.findIndex((a) => a.id === armyData.id);
      if (idx >= 0) this.armies[idx] = { ...this.armies[idx], ...armyData };
      else this.armies.push(armyData);
    },

    updateCharacterGold(characterId, gold) {
      const char = this.characters.find((c) => c.id === characterId);
      if (char) char.gold = gold;
    },

    updateMarriage(char1Id, char2Id) {
      const c1 = this.characters.find((c) => c.id === char1Id);
      const c2 = this.characters.find((c) => c.id === char2Id);
      if (c1) c1.spouseId = char2Id;
      if (c2) c2.spouseId = char1Id;
    },

    updatePopulationRole(populationId, role) {
      const pop = this.populations.find((p) => p.id === populationId);
      if (pop) pop.role = role;
    },
  },
});
