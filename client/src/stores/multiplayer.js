import { defineStore } from 'pinia';
import { io } from 'socket.io-client';
import { useAuthStore } from './auth';
import { useGameStore } from './game';

export const useMultiplayerStore = defineStore('multiplayer', {
  state: () => ({
    socket: null,
    isConnected: false,
    sessionId: null,
    inviteCode: null,
    players: [],
    chatMessages: [],
    status: 'disconnected', // disconnected | connecting | connected | in_game
  }),

  actions: {
    connect(sessionId) {
      const auth = useAuthStore();
      if (!auth.token) return;

      this.sessionId = sessionId;
      this.status = 'connecting';

      const socketUrl = window.location.origin;
      this.socket = io(socketUrl, {
        auth: { token: auth.token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });

      this.socket.on('connect', () => {
        this.isConnected = true;
        this.status = 'connected';
        this.socket.emit('join_session', { sessionId: parseInt(sessionId) });
      });

      this.socket.on('disconnect', () => {
        this.isConnected = false;
        this.status = 'disconnected';
      });

      this.socket.on('game_state', (data) => {
        const game = useGameStore();
        game.loadGameState(data);
        this.status = 'in_game';
      });

      this.socket.on('player_joined', (data) => {
        this.players = data.players;
      });

      this.socket.on('player_left', (data) => {
        this.players = this.players.filter((p) => p.userId !== data.userId);
      });

      this.socket.on('player_selected_character', (data) => {
        const player = this.players.find((p) => p.userId === data.userId);
        if (player) {
          player.characterId = data.characterId;
        }
        // Mark the character as player-controlled in the game store
        const game = useGameStore();
        const char = game.characters.find((c) => c.id === data.characterId);
        if (char) {
          char.isPlayer = true;
        }
      });

      this.socket.on('tick', (data) => {
        const game = useGameStore();
        game.applyTick(data);
      });

      this.socket.on('events_pending', (data) => {
        const game = useGameStore();
        game.setPendingEvents(data.events);
        game.isPaused = true;
      });

      this.socket.on('events_cleared', () => {
        const game = useGameStore();
        game.pendingEvents = [];
      });

      this.socket.on('game_started', () => {
        const game = useGameStore();
        game.isPaused = false;
      });

      this.socket.on('game_paused', () => {
        const game = useGameStore();
        game.isPaused = true;
      });

      this.socket.on('game_resumed', () => {
        const game = useGameStore();
        game.isPaused = false;
      });

      this.socket.on('speed_changed', (data) => {
        const game = useGameStore();
        game.tickSpeed = data.speed;
      });

      this.socket.on('chat_message', (data) => {
        this.chatMessages.push(data);
        if (this.chatMessages.length > 100) {
          this.chatMessages.shift();
        }
      });

      this.socket.on('game_saved', () => {
        const game = useGameStore();
        game.addNotification({ type: 'info', message: 'Game saved successfully' });
      });

      this.socket.on('building_started', (data) => {
        const game = useGameStore();
        if (data.characterId) game.updateCharacterGold(data.characterId, data.goldRemaining);
        const holding = game.holdings.find((h) => h.id === data.holdingId);
        if (holding && data.building) {
          if (!holding.buildings) holding.buildings = [];
          const existing = holding.buildings.find((b) => b.buildingKey === data.buildingKey);
          if (existing) {
            Object.assign(existing, data.building);
          } else {
            holding.buildings.push({ id: Date.now(), ...data.building });
          }
        }
        game.addNotification({ type: 'success', message: `Construction started: ${data.buildingKey.replace(/_/g, ' ')}` });
      });

      this.socket.on('war_declared', (data) => {
        const game = useGameStore();
        game.addWar(data.war);
        game.addNotification({ type: 'error', message: `War: ${data.war.name}` });
      });

      this.socket.on('marriage_accepted', (data) => {
        const game = useGameStore();
        game.updateMarriage(data.char1Id, data.char2Id);
        game.addNotification({ type: 'success', message: 'Marriage proposal accepted!' });
      });

      this.socket.on('marriage_rejected', (data) => {
        const game = useGameStore();
        game.addNotification({ type: 'info', message: data.reason || 'Marriage proposal rejected' });
      });

      this.socket.on('scheme_started', (data) => {
        const game = useGameStore();
        game.addScheme(data.scheme);
        game.addNotification({ type: 'info', message: `Scheme started: ${data.scheme.type.replace(/_/g, ' ')}` });
      });

      this.socket.on('army_update', (data) => {
        const game = useGameStore();
        game.updateArmy(data.army);
        if (data.army.isRaised) {
          game.addNotification({ type: 'info', message: `${data.army.name} has been raised` });
        }
      });

      this.socket.on('error', (data) => {
        console.error('Socket error:', data.message);
        const game = useGameStore();
        game.addNotification({ type: 'error', message: data.message });
      });
    },

    startGame() { this.socket?.emit('start_game'); },
    pauseGame() { this.socket?.emit('pause_game'); },
    resumeGame() { this.socket?.emit('resume_game'); },
    setSpeed(speed) { this.socket?.emit('set_speed', { speed }); },
    selectCharacter(characterId) { this.socket?.emit('select_character', { characterId }); },
    sendEventChoice(characterId, eventKey, optionIndex) {
      this.socket?.emit('event_choice', { characterId, eventKey, optionIndex });
    },
    moveArmy(armyId, targetX, targetY) {
      this.socket?.emit('move_army', { armyId, targetX, targetY });
    },
    saveGame() { this.socket?.emit('save_game'); },
    sendChat(message) { this.socket?.emit('chat_message', { message }); },
    constructBuilding(holdingId, buildingKey) {
      this.socket?.emit('construct_building', { holdingId, buildingKey });
    },
    declareWar(targetCharacterId, casusBelli, targetTitleKey) {
      this.socket?.emit('declare_war', { targetCharacterId, casusBelli, targetTitleKey });
    },
    proposeMarriage(targetCharacterId) {
      this.socket?.emit('propose_marriage', { targetCharacterId });
    },
    startScheme(targetCharacterId, schemeType) {
      this.socket?.emit('start_scheme', { targetCharacterId, schemeType });
    },
    raiseArmy() { this.socket?.emit('raise_army'); },
    disbandArmy() { this.socket?.emit('disband_army'); },

    disconnect() {
      this.socket?.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.sessionId = null;
      this.status = 'disconnected';
      this.players = [];
    },
  },
});
