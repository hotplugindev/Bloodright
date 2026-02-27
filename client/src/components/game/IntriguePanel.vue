<template>
  <div class="panel-content">
    <div class="panel-header"><h3>🗡️ Intrigue</h3><button class="nav-btn" @click="game.closePanel()">✕</button></div>
    <div v-if="char">
      <div class="section" v-if="isPlayerChar">
        <h4>Start New Scheme</h4>
        <div class="target-select" v-if="!schemeTarget">
          <p class="hint">Select a target from the list below:</p>
          <div class="target-list">
            <div v-for="ruler in otherRulers" :key="ruler.id" class="target-row" @click="schemeTarget = ruler">
              <span>{{ ruler.isMale ? '👤' : '👩' }} {{ ruler.firstName }} {{ ruler.lastName }}</span>
            </div>
          </div>
        </div>
        <div v-else class="scheme-options">
          <div class="target-display">
            Target: <strong>{{ schemeTarget.firstName }} {{ schemeTarget.lastName }}</strong>
            <button class="btn-mini" @click="schemeTarget = null">✕</button>
          </div>
          <div class="scheme-grid">
            <button class="scheme-btn" @click="launchScheme('murder')">🗡️ Murder</button>
            <button class="scheme-btn" @click="launchScheme('abduct')">🔗 Abduct</button>
            <button class="scheme-btn" @click="launchScheme('seduce')">💋 Seduce</button>
            <button class="scheme-btn" @click="launchScheme('fabricate_claim')">📜 Fabricate Claim</button>
          </div>
        </div>
      </div>
      <div class="section"><h4>Active Schemes ({{ activeSchemes.length }})</h4>
        <p class="empty-state" v-if="!activeSchemes.length">No active schemes</p>
        <div v-for="s in activeSchemes" :key="s.id" class="scheme-card">
          <div class="scheme-header">
            <strong>{{ s.type?.replace(/_/g, ' ') }}</strong>
            <span class="scheme-target-name">→ {{ getCharName(s.targetId) }}</span>
          </div>
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
import { ref, computed } from 'vue';
import { useGameStore } from '../../stores/game';
import { useMultiplayerStore } from '../../stores/multiplayer';

const game = useGameStore();
const mp = useMultiplayerStore();
const char = computed(() => game.selectedCharacter);
const isPlayerChar = computed(() => char.value && game.playerCharacterId === char.value.id);
const schemeTarget = ref(null);

const activeSchemes = computed(() =>
  game.schemes.filter((s) => s.ownerId === char.value?.id && s.isActive));

const otherRulers = computed(() =>
  game.livingCharacters.filter((c) => {
    if (c.id === char.value?.id) return false;
    return game.titles.some((t) => t.holderId === c.id && t.tier !== 'barony');
  }));

function getCharName(id) {
  const c = game.characters.find((ch) => ch.id === id);
  return c ? `${c.firstName} ${c.lastName}` : 'Unknown';
}

function launchScheme(type) {
  if (schemeTarget.value) {
    mp.startScheme(schemeTarget.value.id, type);
    schemeTarget.value = null;
  }
}
</script>

<style scoped>
.panel-content { padding: var(--gap-md); }
.section { margin-bottom: var(--gap-lg); }
.section h4 { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--gap-sm); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
.scheme-card { background: var(--bg-hover); border-radius: var(--border-radius); padding: var(--gap-sm) var(--gap-md); margin-bottom: var(--gap-sm); }
.scheme-header { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: var(--gap-sm); text-transform: capitalize; }
.scheme-target-name { font-size: 0.75rem; color: var(--text-secondary); }
.scheme-status { font-size: 0.75rem; color: var(--color-success); }
.hint { font-size: 0.8rem; color: var(--text-muted); margin-bottom: var(--gap-sm); }
.target-list { max-height: 150px; overflow-y: auto; }
.target-row { padding: 6px 8px; font-size: 0.8rem; cursor: pointer; border-radius: var(--border-radius); transition: background 0.15s; }
.target-row:hover { background: var(--bg-hover); }
.target-display { display: flex; align-items: center; gap: var(--gap-sm); font-size: 0.85rem; margin-bottom: var(--gap-sm); padding: 6px 8px; background: var(--bg-hover); border-radius: var(--border-radius); }
.btn-mini { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; padding: 2px 6px; margin-left: auto; }
.btn-mini:hover { color: var(--text-primary); }
.scheme-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.scheme-btn { padding: 8px; background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-primary); cursor: pointer; font-size: 0.8rem; font-family: var(--font-body); transition: all 0.2s; }
.scheme-btn:hover { border-color: var(--gold-dark); background: var(--bg-surface); }
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
