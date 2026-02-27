<template>
  <div class="panel-content">
    <div class="panel-header"><h3>💰 Economy</h3><button class="nav-btn" @click="game.closePanel()">✕</button></div>
    <div v-if="char">
      <div class="treasury"><span class="resource gold">💰 {{ Math.floor(char.gold) }} Gold</span></div>
      <div class="section"><h4>Income Breakdown</h4>
        <div class="econ-row"><span>Domain Income</span><span class="positive">+{{ domainIncome.toFixed(1) }}/mo</span></div>
        <div class="econ-row"><span>Vassal Taxes</span><span class="positive">+{{ vassalIncome.toFixed(1) }}/mo</span></div>
        <div class="econ-row"><span>Maintenance</span><span class="negative">-{{ maintenance.toFixed(1) }}/mo</span></div>
        <div class="econ-row total"><span>Net Income</span><span :class="net >= 0 ? 'positive' : 'negative'">{{ net >= 0 ? '+' : '' }}{{ net.toFixed(1) }}/mo</span></div>
      </div>
      <div class="section"><h4>Holdings</h4>
        <div v-for="h in holdings" :key="h.id" class="holding-card">
          <div class="holding-header"><span>🏰 {{ holdingTitle(h) }}</span><span class="dev">Dev: {{ h.development?.toFixed(1) }}</span></div>
          <div class="building-list"><div v-for="b in h.buildings" :key="b.id" class="building-item">
            <span>{{ b.buildingKey.replace(/_/g, ' ') }}</span><span>Lv.{{ b.level }}</span>
            <span v-if="b.isBuilding" class="building-progress">🔨 {{ b.buildDays }}d</span>
          </div></div>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">Select a character to view economy</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../../stores/game';
const game = useGameStore();
const char = computed(() => game.selectedCharacter);
const holdings = computed(() => {
  if (!char.value) return [];
  const titleIds = game.titles.filter((t) => t.holderId === char.value.id).map((t) => t.id);
  // Holdings don't have direct savegameId filter on client; use title matching
  return [];
});
const domainIncome = computed(() => (char.value?.gold || 0) * 0.1);
const vassalIncome = computed(() => (char.value?.gold || 0) * 0.03);
const maintenance = computed(() => (char.value?.gold || 0) * 0.02);
const net = computed(() => domainIncome.value + vassalIncome.value - maintenance.value);
function holdingTitle(h) { return game.titles.find((t) => t.id === h.titleId)?.name || 'Unknown'; }
</script>

<style scoped>
.panel-content { padding: var(--gap-md); }
.treasury { text-align: center; padding: var(--gap-md); margin-bottom: var(--gap-lg); background: var(--bg-hover); border-radius: var(--border-radius-lg); font-size: 1.2rem; }
.section { margin-bottom: var(--gap-lg); }
.section h4 { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--gap-sm); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
.econ-row { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 0.85rem; }
.econ-row.total { border-top: 1px solid var(--border-color); padding-top: var(--gap-sm); margin-top: var(--gap-sm); font-weight: 600; }
.positive { color: var(--color-success); }
.negative { color: var(--color-danger); }
.holding-card { background: var(--bg-hover); border-radius: var(--border-radius); padding: var(--gap-sm); margin-bottom: var(--gap-sm); }
.holding-header { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px; }
.dev { color: var(--text-secondary); font-size: 0.75rem; }
.building-item { display: flex; gap: var(--gap-sm); font-size: 0.75rem; color: var(--text-secondary); padding: 2px 0; text-transform: capitalize; }
.building-progress { color: var(--color-warning); }
.empty-state { padding: var(--gap-xl); text-align: center; color: var(--text-muted); }
</style>
