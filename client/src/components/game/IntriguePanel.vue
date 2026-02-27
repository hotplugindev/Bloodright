<template>
  <div class="panel-content">
    <div class="panel-header"><h3>🗡️ Intrigue</h3><button class="nav-btn" @click="game.closePanel()">✕</button></div>
    <div v-if="char">
      <div class="section"><h4>Active Schemes</h4>
        <p class="empty-state" v-if="!schemes.length">No active schemes</p>
        <div v-for="s in schemes" :key="s.id" class="scheme-card">
          <div class="scheme-header"><strong>{{ s.type?.replace(/_/g, ' ') }}</strong><span class="scheme-status">{{ s.isActive ? 'Active' : 'Ended' }}</span></div>
          <div class="scheme-bars">
            <div class="scheme-bar"><span>Power</span><div class="bar-track"><div class="bar-fill power" :style="{ width: Math.min(100, s.power) + '%' }"></div></div></div>
            <div class="scheme-bar"><span>Secrecy</span><div class="bar-track"><div class="bar-fill secrecy" :style="{ width: s.secrecy + '%' }"></div></div></div>
            <div class="scheme-bar"><span>Progress</span><div class="bar-track"><div class="bar-fill progress" :style="{ width: Math.min(100, s.progress) + '%' }"></div></div></div>
          </div>
        </div>
      </div>
      <div class="section"><h4>Secrets Known</h4><p class="empty-state">No secrets discovered yet</p></div>
    </div>
    <div v-else class="empty-state">Select a character to view intrigue</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../../stores/game';
const game = useGameStore();
const char = computed(() => game.selectedCharacter);
const schemes = computed(() => []);
</script>

<style scoped>
.panel-content { padding: var(--gap-md); }
.section { margin-bottom: var(--gap-lg); }
.section h4 { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--gap-sm); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
.scheme-card { background: var(--bg-hover); border-radius: var(--border-radius); padding: var(--gap-sm) var(--gap-md); margin-bottom: var(--gap-sm); }
.scheme-header { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: var(--gap-sm); text-transform: capitalize; }
.scheme-status { font-size: 0.75rem; color: var(--color-success); }
.scheme-bars { display: flex; flex-direction: column; gap: 4px; }
.scheme-bar { display: flex; align-items: center; gap: var(--gap-sm); font-size: 0.75rem; }
.scheme-bar span { width: 60px; color: var(--text-secondary); }
.bar-track { flex: 1; height: 4px; background: var(--bg-dark); border-radius: 2px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 2px; }
.bar-fill.power { background: var(--color-danger); }
.bar-fill.secrecy { background: var(--tier-duchy); }
.bar-fill.progress { background: var(--color-success); }
.empty-state { padding: var(--gap-md); text-align: center; color: var(--text-muted); font-size: 0.85rem; }
</style>
