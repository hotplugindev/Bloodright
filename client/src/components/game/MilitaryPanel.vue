<template>
  <div class="panel-content">
    <div class="panel-header"><h3>⚔️ Military</h3><button class="nav-btn" @click="game.closePanel()">✕</button></div>
    <div v-if="char">
      <div class="section"><h4>Armies</h4>
        <div v-if="armies.length" class="army-list">
          <div v-for="army in armies" :key="army.id" class="army-card">
            <div class="army-header"><strong>{{ army.name }}</strong><span class="morale">Morale: {{ (army.morale * 100).toFixed(0) }}%</span></div>
            <div class="army-stats"><span>⚔️ {{ army.levies }} levies</span><span>{{ army.isRaised ? '🚩 Raised' : '🏠 Garrisoned' }}</span></div>
          </div>
        </div>
        <p v-else class="empty-state">No armies raised</p>
      </div>
      <div class="section"><h4>Active Wars</h4>
        <div v-if="activeWars.length" class="war-list">
          <div v-for="war in activeWars" :key="war.id" class="war-card">
            <strong>{{ war.name }}</strong>
            <div class="war-score"><span>War Score:</span>
              <div class="score-bar"><div class="score-fill" :style="{ width: Math.abs(war.warScore) + '%', background: war.warScore >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }"></div></div>
              <span>{{ war.warScore?.toFixed(0) }}%</span>
            </div>
            <div class="war-meta">CB: {{ war.casusBelli?.replace(/_/g, ' ') || 'N/A' }}</div>
          </div>
        </div>
        <p v-else class="empty-state">No active wars</p>
      </div>
    </div>
    <div v-else class="empty-state">Select a character to view military</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../../stores/game';
const game = useGameStore();
const char = computed(() => game.selectedCharacter);
const armies = computed(() => game.armies.filter((a) => a.ownerId === char.value?.id));
const activeWars = computed(() => game.wars.filter((w) => !w.endDate && (w.attackerId === char.value?.id || w.defenderId === char.value?.id)));
</script>

<style scoped>
.panel-content { padding: var(--gap-md); }
.section { margin-bottom: var(--gap-lg); }
.section h4 { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--gap-sm); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
.army-card, .war-card { background: var(--bg-hover); border-radius: var(--border-radius); padding: var(--gap-sm) var(--gap-md); margin-bottom: var(--gap-sm); }
.army-header { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px; }
.morale { color: var(--text-secondary); font-size: 0.75rem; }
.army-stats { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-secondary); }
.war-score { display: flex; align-items: center; gap: var(--gap-sm); font-size: 0.8rem; margin-top: 4px; }
.score-bar { flex: 1; height: 6px; background: var(--bg-dark); border-radius: 3px; overflow: hidden; }
.score-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.war-meta { font-size: 0.75rem; color: var(--text-muted); margin-top: 4px; text-transform: capitalize; }
.empty-state { padding: var(--gap-md); text-align: center; color: var(--text-muted); font-size: 0.85rem; }
</style>
