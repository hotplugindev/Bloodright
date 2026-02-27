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
      <div class="section"><h4>Holdings ({{ holdings.length }})</h4>
        <div v-if="holdings.length === 0" class="empty-state">No holdings found</div>
        <div v-for="h in holdings" :key="h.id" class="holding-card">
          <div class="holding-header"><span>🏰 {{ holdingTitle(h) }}</span><span class="dev">Dev: {{ h.development?.toFixed(1) }}</span></div>
          <div class="building-list">
            <div v-for="b in (h.buildings || [])" :key="b.id" class="building-item">
              <span>{{ formatBuildingName(b.buildingKey) }}</span><span>Lv.{{ b.level }}</span>
              <span v-if="b.isBuilding" class="building-progress">🔨 {{ b.buildDays }}d</span>
            </div>
          </div>
          <div class="build-section" v-if="isPlayerChar">
            <div class="build-title">Construct:</div>
            <div class="build-grid">
              <button v-for="bk in availableBuildings(h)" :key="bk.key"
                      class="build-btn" @click="constructBuilding(h.id, bk.key)"
                      :disabled="char.gold < bk.cost"
                      :title="`${bk.name} - Cost: ${bk.cost}g, ${bk.days}d`">
                <span class="build-name">{{ bk.name }}</span>
                <span class="build-cost">{{ bk.cost }}g</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">Select a character to view economy</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../../stores/game';
import { useMultiplayerStore } from '../../stores/multiplayer';

const game = useGameStore();
const mp = useMultiplayerStore();
const char = computed(() => game.selectedCharacter);
const isPlayerChar = computed(() => char.value && game.playerCharacterId === char.value.id);

const holdings = computed(() => {
  if (!char.value) return [];
  const ownedTitleIds = game.titles.filter((t) => t.holderId === char.value.id).map((t) => t.id);
  return game.holdings.filter((h) => ownedTitleIds.includes(h.titleId));
});

const BUILDINGS = {
  castle_walls: { name: 'Castle Walls', type: 'castle', maxLevel: 4, costs: [100, 200, 400, 800], buildDays: [180, 270, 365, 540] },
  barracks: { name: 'Barracks', type: 'castle', maxLevel: 3, costs: [75, 150, 300], buildDays: [120, 180, 270] },
  armory: { name: 'Armory', type: 'castle', maxLevel: 3, costs: [100, 200, 400], buildDays: [150, 240, 360] },
  manor_house: { name: 'Manor House', type: 'castle', maxLevel: 3, costs: [60, 120, 250], buildDays: [90, 150, 240] },
  hunting_grounds: { name: 'Hunting Grounds', type: 'castle', maxLevel: 2, costs: [80, 160], buildDays: [120, 180] },
  market: { name: 'Market', type: 'city', maxLevel: 3, costs: [50, 100, 200], buildDays: [90, 120, 180] },
  guild_hall: { name: 'Guild Hall', type: 'city', maxLevel: 3, costs: [75, 150, 300], buildDays: [120, 180, 270] },
  monastery: { name: 'Monastery', type: 'temple', maxLevel: 3, costs: [60, 120, 250], buildDays: [120, 180, 270] },
  farm_estate: { name: 'Farm Estate', type: 'castle', maxLevel: 3, costs: [40, 80, 160], buildDays: [60, 90, 150] },
};

function availableBuildings(holding) {
  const result = [];
  for (const [key, def] of Object.entries(BUILDINGS)) {
    const existing = (holding.buildings || []).find((b) => b.buildingKey === key);
    const currentLevel = existing ? existing.level : 0;
    if (currentLevel >= def.maxLevel) continue;
    if (existing?.isBuilding) continue;
    result.push({
      key,
      name: def.name,
      level: currentLevel + 1,
      cost: def.costs[currentLevel] || 999,
      days: def.buildDays[currentLevel] || 999,
    });
  }
  return result;
}

function constructBuilding(holdingId, buildingKey) {
  mp.constructBuilding(holdingId, buildingKey);
}

function formatBuildingName(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const domainIncome = computed(() => {
  let income = 0;
  for (const h of holdings.value) {
    income += (h.development || 1) * 0.5;
    for (const b of (h.buildings || [])) {
      if (!b.isBuilding && b.level > 0) income += b.level * 0.3;
    }
  }
  return income;
});
const vassalIncome = computed(() => domainIncome.value * 0.15);
const maintenance = computed(() => {
  let cost = 0;
  for (const h of holdings.value) {
    for (const b of (h.buildings || [])) {
      cost += b.level * 0.1;
    }
  }
  return cost;
});
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
.build-section { margin-top: var(--gap-sm); padding-top: var(--gap-sm); border-top: 1px solid var(--border-color); }
.build-title { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
.build-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.build-btn { display: flex; flex-direction: column; align-items: center; padding: 4px 8px; background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: var(--border-radius); cursor: pointer; transition: all 0.2s; font-family: var(--font-body); }
.build-btn:hover:not(:disabled) { border-color: var(--gold-dark); background: var(--bg-surface); }
.build-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.build-name { font-size: 0.7rem; color: var(--text-primary); white-space: nowrap; }
.build-cost { font-size: 0.65rem; color: var(--gold-light); }
.empty-state { padding: var(--gap-xl); text-align: center; color: var(--text-muted); }
</style>
