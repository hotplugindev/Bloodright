<template>
  <div class="panel-content">
    <div class="panel-header">
      <h3>🏰 Realm</h3>
      <button class="nav-btn" @click="game.closePanel()">✕</button>
    </div>
    <div v-if="char">
      <div class="section">
        <h4>Held Titles</h4>
        <div v-for="title in heldTitles" :key="title.id" class="title-row" @click="game.selectTitle(title.id)">
          <span class="tier-dot" :class="'tier-' + title.tier"></span>
          <span class="title-name">{{ title.name }}</span>
          <span class="title-tier">{{ title.tier }}</span>
        </div>
      </div>

      <div class="section" v-if="isPlayerChar && selectedCounty">
        <h4>Selected: {{ selectedCounty.name }}</h4>
        <div class="county-info">
          <div class="info-row"><span>Terrain:</span><span>{{ selectedCounty.terrain }}</span></div>
          <div class="info-row"><span>Holder:</span><span>{{ getHolderName(selectedCounty.holderId) }}</span></div>
        </div>
        <div class="action-grid" v-if="selectedCounty.holderId !== char.id">
          <button class="action-btn" @click="declareWarForTitle">⚔️ Declare War for {{ selectedCounty.name }}</button>
          <button class="action-btn" @click="fabricateClaim">📜 Fabricate Claim</button>
        </div>
      </div>

      <div class="section" v-if="vassals.length">
        <h4>Vassals ({{ vassals.length }})</h4>
        <div v-for="vassal in vassals" :key="vassal.id" class="vassal-row" @click="selectVassal(vassal)">
          <span>{{ getHolderName(vassal.holderId) }}</span>
          <span class="vassal-title">{{ vassal.name }}</span>
        </div>
      </div>
      <div class="section">
        <h4>Realm Laws</h4>
        <div class="law-item">
          <span>Succession</span>
          <span class="law-value">{{ primaryTitle?.successionLaw || 'partition' }}</span>
        </div>
        <div class="law-item">
          <span>Gender Law</span>
          <span class="law-value">{{ primaryTitle?.genderLaw || 'male_preference' }}</span>
        </div>
        <div class="law-item">
          <span>Vassal Tax</span>
          <span class="law-value">{{ ((primaryTitle?.vassalTaxRate || 0.1) * 100).toFixed(0) }}%</span>
        </div>
        <div class="law-item">
          <span>Vassal Levy</span>
          <span class="law-value">{{ ((primaryTitle?.vassalLevyRate || 0.25) * 100).toFixed(0) }}%</span>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">Select a character to view realm</div>
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

const heldTitles = computed(() => game.titles.filter((t) => t.holderId === char.value?.id && t.tier !== 'barony').sort((a, b) => { const order = { empire: 0, kingdom: 1, duchy: 2, county: 3 }; return (order[a.tier] || 4) - (order[b.tier] || 4); }));
const primaryTitle = computed(() => heldTitles.value[0]);
const vassals = computed(() => {
  if (!char.value) return [];
  return game.titles.filter((t) => {
    if (t.holderId === char.value.id) return false;
    return heldTitles.value.some((ht) => t.deJureParentId === ht.id || t.liegeId === ht.id);
  });
});

const selectedCounty = computed(() => {
  if (!game.selectedTitleId) return null;
  return game.titles.find((t) => t.id === game.selectedTitleId && t.tier === 'county');
});

function getHolderName(holderId) {
  if (!holderId) return 'None';
  const c = game.characters.find((ch) => ch.id === holderId);
  return c ? `${c.firstName} ${c.lastName}` : 'Unknown';
}

function selectVassal(vassal) {
  if (vassal.holderId) game.selectCharacter(vassal.holderId);
}

function declareWarForTitle() {
  const county = selectedCounty.value;
  if (county && county.holderId) {
    mp.declareWar(county.holderId, 'conquest', county.key);
  }
}

function fabricateClaim() {
  const county = selectedCounty.value;
  if (county && county.holderId) {
    mp.startScheme(county.holderId, 'fabricate_claim');
  }
}
</script>

<style scoped>
.panel-content { padding: var(--gap-md); }
.section { margin-bottom: var(--gap-lg); }
.section h4 { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--gap-sm); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
.title-row { display: flex; align-items: center; gap: var(--gap-sm); padding: 6px 8px; font-size: 0.85rem; cursor: pointer; border-radius: var(--border-radius); }
.title-row:hover { background: var(--bg-hover); }
.tier-dot { width: 8px; height: 8px; border-radius: 50%; }
.tier-dot.tier-empire { background: var(--tier-empire); }
.tier-dot.tier-kingdom { background: var(--tier-kingdom); }
.tier-dot.tier-duchy { background: var(--tier-duchy); }
.tier-dot.tier-county { background: var(--tier-county); }
.title-name { flex: 1; }
.title-tier { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; }
.vassal-row { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 0.8rem; cursor: pointer; border-radius: var(--border-radius); }
.vassal-row:hover { background: var(--bg-hover); }
.vassal-title { color: var(--text-secondary); font-size: 0.75rem; }
.county-info { margin-bottom: var(--gap-sm); }
.info-row { display: flex; justify-content: space-between; padding: 2px 8px; font-size: 0.8rem; color: var(--text-secondary); }
.action-grid { display: flex; flex-direction: column; gap: 4px; margin-top: var(--gap-sm); }
.action-btn { display: flex; align-items: center; gap: var(--gap-sm); padding: 8px 12px; background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-primary); cursor: pointer; font-size: 0.8rem; font-family: var(--font-body); transition: all 0.2s; }
.action-btn:hover { border-color: var(--gold-dark); background: var(--bg-surface); }
.law-item { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 0.8rem; }
.law-value { color: var(--gold-light); text-transform: capitalize; }
.empty-state { padding: var(--gap-xl); text-align: center; color: var(--text-muted); }
</style>
