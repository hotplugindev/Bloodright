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
    selectedCharacterId: null,
    selectedTitleId: null,
    playerCharacterId: null,
    activePanel: null, // 'character' | 'dynasty' | 'realm' | 'economy' | 'military' | 'diplomacy' | 'intrigue'
    pendingEvents: [],
    notifications: [],
    isPaused: true,
    tickSpeed: 1,
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
          }
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

    setPanel(panel) {
      this.activePanel = panel;
    },

    closePanel() {
      this.activePanel = null;
    },

    addNotification(notification) {
      this.notifications.unshift({
        id: Date.now(),
        ...notification,
        timestamp: new Date(),
      });
      if (this.notifications.length > 50) {
        this.notifications.pop();
      }
    },

    setPendingEvents(events) {
      this.pendingEvents = events;
    },

    clearEvent(eventKey) {
      this.pendingEvents = this.pendingEvents.filter((e) => e.eventKey !== eventKey);
    },

    addWar(war) {
      const exists = this.wars.find((w) => w.id === war.id);
      if (!exists) this.wars.push(war);
    },

    addScheme(scheme) {
      this.schemes.push(scheme);
    },

    updateArmy(armyData) {
      const idx = this.armies.findIndex((a) => a.id === armyData.id);
      if (idx >= 0) {
        this.armies[idx] = { ...this.armies[idx], ...armyData };
      } else {
        this.armies.push(armyData);
      }
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
  },
});
