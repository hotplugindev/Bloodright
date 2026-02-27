<template>
  <div class="panel-content">
    <div class="panel-header"><h3>🤝 Diplomacy</h3><button class="nav-btn" @click="game.closePanel()">✕</button></div>
    <div v-if="char">
      <div class="section"><h4>Resources</h4>
        <div class="resource-row"><span class="resource prestige">⭐ {{ Math.floor(char.prestige) }} Prestige</span></div>
      </div>
      <div class="section"><h4>Alliances</h4>
        <p class="empty-state" v-if="!alliances.length">No active alliances</p>
        <div v-for="a in alliances" :key="a.id" class="alliance-row">
          Alliance with Character #{{ a.char1Id === char.id ? a.char2Id : a.char1Id }}
          <span class="alliance-reason">({{ a.reason }})</span>
        </div>
      </div>
      <div class="section"><h4>Relations</h4>
        <p class="empty-state">Interact with characters on the map to view relationships</p>
      </div>
    </div>
    <div v-else class="empty-state">Select a character to view diplomacy</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../../stores/game';
const game = useGameStore();
const char = computed(() => game.selectedCharacter);
const alliances = computed(() => []);
</script>

<style scoped>
.panel-content { padding: var(--gap-md); }
.section { margin-bottom: var(--gap-lg); }
.section h4 { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--gap-sm); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
.resource-row { padding: 8px; background: var(--bg-hover); border-radius: var(--border-radius); font-size: 1rem; }
.alliance-row { padding: 6px 8px; font-size: 0.85rem; }
.alliance-reason { color: var(--text-muted); font-size: 0.75rem; }
.empty-state { padding: var(--gap-md); text-align: center; color: var(--text-muted); font-size: 0.85rem; }
</style>
