<template>
  <div class="top-bar">
    <div class="top-left">
      <button class="nav-btn" :class="{ active: game.activePanel === 'character' }" @click="game.setPanel(game.activePanel === 'character' ? null : 'character')" id="nav-character">👤 Character</button>
      <button class="nav-btn" :class="{ active: game.activePanel === 'dynasty' }" @click="game.setPanel(game.activePanel === 'dynasty' ? null : 'dynasty')" id="nav-dynasty">👑 Dynasty</button>
      <button class="nav-btn" :class="{ active: game.activePanel === 'realm' }" @click="game.setPanel(game.activePanel === 'realm' ? null : 'realm')" id="nav-realm">🏰 Realm</button>
      <button class="nav-btn" :class="{ active: game.activePanel === 'economy' }" @click="game.setPanel(game.activePanel === 'economy' ? null : 'economy')" id="nav-economy">💰 Economy</button>
      <button class="nav-btn" :class="{ active: game.activePanel === 'military' }" @click="game.setPanel(game.activePanel === 'military' ? null : 'military')" id="nav-military">⚔️ Military</button>
      <button class="nav-btn" :class="{ active: game.activePanel === 'diplomacy' }" @click="game.setPanel(game.activePanel === 'diplomacy' ? null : 'diplomacy')" id="nav-diplomacy">🤝 Diplomacy</button>
      <button class="nav-btn" :class="{ active: game.activePanel === 'intrigue' }" @click="game.setPanel(game.activePanel === 'intrigue' ? null : 'intrigue')" id="nav-intrigue">🗡️ Intrigue</button>
    </div>

    <div class="top-center">
      <div class="resources" v-if="playerChar">
        <span class="resource gold" :title="'Gold'">💰 {{ Math.floor(playerChar.gold) }}</span>
        <span class="resource prestige" :title="'Prestige'">⭐ {{ Math.floor(playerChar.prestige) }}</span>
        <span class="resource piety" :title="'Piety'">🙏 {{ Math.floor(playerChar.piety) }}</span>
      </div>
    </div>

    <div class="top-right">
      <div class="date-display">{{ game.formattedDate }}</div>
      <div class="speed-controls">
        <button class="speed-btn" @click="togglePause" id="pause-btn">
          {{ game.isPaused ? '▶' : '⏸' }}
        </button>
        <button v-for="s in [1,2,3,4,5]" :key="s" class="speed-btn"
                :class="{ active: game.tickSpeed === s }" @click="setSpeed(s)"
                :id="'speed-' + s">
          {{ s }}
        </button>
      </div>
      <button class="nav-btn" @click="mp.saveGame()" id="save-btn">💾</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../../stores/game';
import { useMultiplayerStore } from '../../stores/multiplayer';

const game = useGameStore();
const mp = useMultiplayerStore();

const playerChar = computed(() => game.playerCharacter || game.playerCharacters[0]);

function togglePause() {
  if (game.isPaused) mp.resumeGame();
  else mp.pauseGame();
}

function setSpeed(s) {
  mp.setSpeed(s);
}
</script>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  padding: 0 var(--gap-sm);
  background: linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%);
  border-bottom: 1px solid var(--border-color);
  z-index: 20;
}

.top-left, .top-right { display: flex; align-items: center; gap: var(--gap-xs); }
.top-center { display: flex; align-items: center; gap: var(--gap-lg); }

.nav-btn {
  padding: 4px 10px;
  font-family: var(--font-body);
  font-size: 0.75rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.nav-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
.nav-btn.active {
  color: var(--gold-light);
  border-color: var(--gold-dark);
  background: var(--bg-hover);
}

.resources { display: flex; gap: var(--gap-md); }

.date-display {
  font-family: var(--font-display);
  font-size: 0.85rem;
  color: var(--gold-light);
  letter-spacing: 0.05em;
  padding: 0 var(--gap-md);
}

.speed-controls { display: flex; gap: 2px; }
.speed-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  background: var(--bg-dark);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}
.speed-btn:hover { color: var(--text-primary); border-color: var(--gold-dark); }
.speed-btn.active { color: var(--gold-light); border-color: var(--gold-primary); background: var(--bg-hover); }
</style>
