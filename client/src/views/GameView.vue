<template>
  <div class="game-view">
    <!-- Top Bar -->
    <TopBar />

    <!-- Main Game Area -->
    <div class="game-main">
      <!-- Left sidebar panels -->
      <transition name="slide">
        <div class="side-panel left-panel" v-if="game.activePanel">
          <CharacterPanel v-if="game.activePanel === 'character'" />
          <DynastyTree v-else-if="game.activePanel === 'dynasty'" />
          <RealmPanel v-else-if="game.activePanel === 'realm'" />
          <EconomyPanel v-else-if="game.activePanel === 'economy'" />
          <MilitaryPanel v-else-if="game.activePanel === 'military'" />
          <DiplomacyPanel v-else-if="game.activePanel === 'diplomacy'" />
          <IntriguePanel v-else-if="game.activePanel === 'intrigue'" />
        </div>
      </transition>

      <!-- Map Canvas -->
      <MapCanvas />
    </div>

    <!-- Bottom Bar -->
    <BottomBar />

    <!-- Event Popup -->
    <EventPopup v-if="game.pendingEvents.length > 0" :event="game.pendingEvents[0]" />

    <!-- Character Selection (pre-game) -->
    <div class="character-select-overlay" v-if="showCharacterSelect">
      <div class="character-select-modal panel fade-in">
        <h2>Choose Your Ruler</h2>
        <p>Select a character to play as in this campaign</p>
        <div class="ruler-grid">
          <div
            v-for="char in availableRulers"
            :key="char.id"
            class="ruler-card"
            :class="{ selected: selectedRuler === char.id }"
            @click="selectedRuler = char.id"
          >
            <div class="ruler-portrait">{{ char.isMale ? '👤' : '👩' }}</div>
            <h4>{{ char.firstName }} {{ char.lastName }}</h4>
            <div class="ruler-stats">
              <span class="tooltip" data-tooltip="Diplomacy">🕊️ {{ char.diplomacy }}</span>
              <span class="tooltip" data-tooltip="Martial">⚔️ {{ char.martial }}</span>
              <span class="tooltip" data-tooltip="Stewardship">💰 {{ char.stewardship }}</span>
              <span class="tooltip" data-tooltip="Intrigue">🗡️ {{ char.intrigue }}</span>
              <span class="tooltip" data-tooltip="Learning">📚 {{ char.learning }}</span>
            </div>
            <div class="ruler-titles">
              {{ getRulerTitles(char.id) }}
            </div>
          </div>
        </div>
        <div class="select-actions">
          <button class="btn btn-primary" @click="confirmRuler" :disabled="!selectedRuler" id="confirm-ruler-btn">
            Begin Reign
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useGameStore } from '../stores/game';
import { useMultiplayerStore } from '../stores/multiplayer';
import TopBar from '../components/game/TopBar.vue';
import BottomBar from '../components/game/BottomBar.vue';
import MapCanvas from '../components/game/MapCanvas.vue';
import CharacterPanel from '../components/game/CharacterPanel.vue';
import DynastyTree from '../components/game/DynastyTree.vue';
import RealmPanel from '../components/game/RealmPanel.vue';
import EconomyPanel from '../components/game/EconomyPanel.vue';
import MilitaryPanel from '../components/game/MilitaryPanel.vue';
import DiplomacyPanel from '../components/game/DiplomacyPanel.vue';
import IntriguePanel from '../components/game/IntriguePanel.vue';
import EventPopup from '../components/game/EventPopup.vue';

const route = useRoute();
const game = useGameStore();
const mp = useMultiplayerStore();
const selectedRuler = ref(null);

const showCharacterSelect = computed(() => {
  // Skip if we already have a persisted ruler (restored from server)
  if (game.playerCharacterId) return false;
  return mp.status === 'in_game' && game.playerCharacters.length === 0;
});

const availableRulers = computed(() => {
  return game.livingCharacters.filter((c) => {
    const hasTitles = game.titles.some((t) => t.holderId === c.id && ['duchy', 'kingdom', 'empire'].includes(t.tier));
    return hasTitles;
  });
});

function getRulerTitles(charId) {
  return game.titles
    .filter((t) => t.holderId === charId && t.tier !== 'barony')
    .map((t) => t.name)
    .join(', ');
}

function confirmRuler() {
  if (selectedRuler.value) {
    mp.selectCharacter(selectedRuler.value);
    game.selectCharacter(selectedRuler.value);
  }
}

onMounted(() => {
  const sessionId = route.params.sessionId;
  mp.connect(sessionId);
});

onUnmounted(() => {
  mp.disconnect();
});
</script>

<style scoped>
.game-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-dark);
}

.game-main {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}

.side-panel {
  width: 380px;
  height: 100%;
  overflow-y: auto;
  background: rgba(10, 10, 15, 0.95);
  border-right: 1px solid var(--border-color);
  backdrop-filter: blur(10px);
  z-index: 10;
}

/* Transitions */
.slide-enter-active, .slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.slide-enter-from, .slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

/* Character Selection Overlay */
.character-select-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.character-select-modal {
  max-width: 800px;
  max-height: 80vh;
  overflow-y: auto;
  text-align: center;
  padding: var(--gap-xl);
}

.character-select-modal h2 { margin-bottom: var(--gap-sm); }
.character-select-modal p { color: var(--text-secondary); margin-bottom: var(--gap-lg); }

.ruler-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--gap-md);
  margin-bottom: var(--gap-lg);
}

.ruler-card {
  background: var(--bg-card);
  border: 2px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  padding: var(--gap-md);
  cursor: pointer;
  transition: all 0.2s;
}

.ruler-card:hover { border-color: var(--gold-dark); }
.ruler-card.selected {
  border-color: var(--gold-primary);
  box-shadow: 0 0 20px var(--gold-glow);
}

.ruler-portrait { font-size: 2rem; margin-bottom: var(--gap-sm); }
.ruler-card h4 { font-size: 0.85rem; margin-bottom: var(--gap-sm); }
.ruler-stats {
  display: flex;
  gap: var(--gap-xs);
  justify-content: center;
  font-size: 0.75rem;
  margin-bottom: var(--gap-sm);
}
.ruler-titles {
  font-size: 0.7rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-actions { margin-top: var(--gap-md); }
</style>
