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
    selectedCharacterId: null,
    selectedTitleId: null,
    activePanel: null, // 'character' | 'dynasty' | 'realm' | 'economy' | 'military' | 'diplomacy' | 'intrigue'
    pendingEvents: [],
    notifications: [],
    isPaused: true,
    tickSpeed: 1,
  }),

  getters: {
    selectedCharacter: (state) => state.characters.find((c) => c.id === state.selectedCharacterId),
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
    },

    applyTick(tickData) {
      this.gameDate = tickData.gameDate;
      // Process incremental updates from server
      if (tickData.updates) {
        // Update specific entities as needed
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
  },
});
