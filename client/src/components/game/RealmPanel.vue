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
      <div class="section" v-if="vassals.length">
        <h4>Vassals ({{ vassals.length }})</h4>
        <div v-for="vassal in vassals" :key="vassal.id" class="vassal-row">
          <span>{{ vassal.holder?.firstName }} {{ vassal.holder?.lastName }}</span>
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
const game = useGameStore();
const char = computed(() => game.selectedCharacter);
const heldTitles = computed(() => game.titles.filter((t) => t.holderId === char.value?.id && t.tier !== 'barony').sort((a, b) => { const order = { empire: 0, kingdom: 1, duchy: 2, county: 3 }; return (order[a.tier] || 4) - (order[b.tier] || 4); }));
const primaryTitle = computed(() => heldTitles.value[0]);
const vassals = computed(() => {
  if (!char.value) return [];
  return game.titles.filter((t) => {
    if (t.holderId === char.value.id) return false;
    return heldTitles.value.some((ht) => t.deJureParentId === ht.id || t.liegeId === ht.id);
  });
});
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
.vassal-row { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 0.8rem; }
.vassal-title { color: var(--text-secondary); font-size: 0.75rem; }
.law-item { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 0.8rem; }
.law-value { color: var(--gold-light); text-transform: capitalize; }
.empty-state { padding: var(--gap-xl); text-align: center; color: var(--text-muted); }
</style>
