<template>
  <div class="panel-content">
    <div class="panel-header"><h3>🤝 Diplomacy</h3><button class="nav-btn" @click="game.closePanel()">✕</button></div>
    <div v-if="char">
      <div class="section"><h4>Resources</h4>
        <div class="resource-row"><span class="resource prestige">⭐ {{ Math.floor(char.prestige) }} Prestige</span></div>
      </div>

      <div class="section" v-if="isPlayerChar && selectedTarget">
        <h4>Actions toward {{ selectedTarget.firstName }} {{ selectedTarget.lastName }}</h4>
        <div class="action-grid">
          <button class="action-btn" @click="proposeMarriage" :disabled="char.spouseId || selectedTarget.spouseId">
            💍 Propose Marriage
          </button>
          <button class="action-btn danger" @click="declareWar" :disabled="isAlreadyAtWar">
            ⚔️ Declare War
          </button>
          <button class="action-btn" @click="startScheme('fabricate_claim')">
            📜 Fabricate Claim
          </button>
          <button class="action-btn" @click="startScheme('seduce')">
            💋 Seduce
          </button>
          <button class="action-btn" @click="swayOpinion">
            🕊️ Sway
          </button>
        </div>
      </div>
      <div class="section" v-else-if="isPlayerChar">
        <h4>Interactions</h4>
        <p class="empty-state">Click a character on the map or select one to interact</p>
      </div>

      <div class="section"><h4>Known Rulers</h4>
        <div class="ruler-list">
          <div v-for="ruler in otherRulers" :key="ruler.id" class="ruler-row"
               :class="{ selected: selectedTarget?.id === ruler.id }"
               @click="selectTarget(ruler)">
            <span>{{ ruler.isMale ? '👤' : '👩' }} {{ ruler.firstName }} {{ ruler.lastName }}</span>
            <span class="ruler-titles-mini">{{ getRulerTitle(ruler.id) }}</span>
          </div>
        </div>
      </div>

      <div class="section"><h4>Alliances</h4>
        <p class="empty-state" v-if="!alliances.length">No active alliances</p>
        <div v-for="a in alliances" :key="a.id || a.char1Id" class="alliance-row">
          Alliance with {{ getAllyName(a) }}
          <span class="alliance-reason">({{ a.reason }})</span>
        </div>
      </div>

      <div class="section"><h4>Active Wars</h4>
        <p class="empty-state" v-if="!myWars.length">No active wars</p>
        <div v-for="w in myWars" :key="w.id" class="war-mini">
          <span>⚔️ {{ w.name }}</span>
          <span class="war-score-mini" :class="w.warScore >= 0 ? 'positive' : 'negative'">
            {{ w.warScore?.toFixed(0) }}%
          </span>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">Select a character to view diplomacy</div>
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
const selectedTarget = ref(null);

const otherRulers = computed(() => {
  if (!char.value) return [];
  return game.livingCharacters.filter((c) => {
    if (c.id === char.value.id) return false;
    return game.titles.some((t) => t.holderId === c.id && t.tier !== 'barony');
  });
});

const alliances = computed(() => game.alliances.filter((a) =>
  a.char1Id === char.value?.id || a.char2Id === char.value?.id));

const myWars = computed(() => game.wars.filter((w) =>
  !w.endDate && (w.attackerId === char.value?.id || w.defenderId === char.value?.id)));

const isAlreadyAtWar = computed(() => {
  if (!selectedTarget.value) return true;
  return game.wars.some((w) => !w.endDate &&
    ((w.attackerId === char.value?.id && w.defenderId === selectedTarget.value.id) ||
     (w.attackerId === selectedTarget.value.id && w.defenderId === char.value?.id)));
});

function selectTarget(ruler) {
  selectedTarget.value = ruler;
}

function getRulerTitle(charId) {
  const titles = game.titles.filter((t) => t.holderId === charId && t.tier !== 'barony');
  return titles.map((t) => t.name).join(', ') || 'Unlanded';
}

function getAllyName(alliance) {
  const otherId = alliance.char1Id === char.value?.id ? alliance.char2Id : alliance.char1Id;
  const c = game.characters.find((ch) => ch.id === otherId);
  return c ? `${c.firstName} ${c.lastName}` : `Character #${otherId}`;
}

function proposeMarriage() {
  if (selectedTarget.value) mp.proposeMarriage(selectedTarget.value.id);
}

function declareWar() {
  if (selectedTarget.value) {
    const targetTitles = game.titles.filter((t) => t.holderId === selectedTarget.value.id && t.tier !== 'barony');
    mp.declareWar(selectedTarget.value.id, 'conquest', targetTitles[0]?.key || null);
  }
}

function startScheme(type) {
  if (selectedTarget.value) mp.startScheme(selectedTarget.value.id, type);
}

function swayOpinion() {
  if (selectedTarget.value) {
    game.addNotification({ type: 'info', message: `Attempting to sway ${selectedTarget.value.firstName}...` });
  }
}
</script>

<style scoped>
.panel-content { padding: var(--gap-md); }
.section { margin-bottom: var(--gap-lg); }
.section h4 { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--gap-sm); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
.resource-row { padding: 8px; background: var(--bg-hover); border-radius: var(--border-radius); font-size: 1rem; }
.alliance-row { padding: 6px 8px; font-size: 0.85rem; }
.alliance-reason { color: var(--text-muted); font-size: 0.75rem; }
.action-grid { display: flex; flex-direction: column; gap: 4px; }
.action-btn { display: flex; align-items: center; gap: var(--gap-sm); padding: 8px 12px; background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-primary); cursor: pointer; font-size: 0.8rem; font-family: var(--font-body); transition: all 0.2s; }
.action-btn:hover:not(:disabled) { border-color: var(--gold-dark); background: var(--bg-surface); }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.action-btn.danger:hover:not(:disabled) { border-color: var(--color-danger); }
.ruler-list { max-height: 200px; overflow-y: auto; }
.ruler-row { display: flex; justify-content: space-between; padding: 6px 8px; font-size: 0.8rem; cursor: pointer; border-radius: var(--border-radius); transition: background 0.15s; }
.ruler-row:hover { background: var(--bg-hover); }
.ruler-row.selected { background: var(--bg-hover); border: 1px solid var(--gold-dark); }
.ruler-titles-mini { font-size: 0.7rem; color: var(--text-muted); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.war-mini { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 0.8rem; }
.war-score-mini { font-weight: 600; }
.war-score-mini.positive { color: var(--color-success); }
.war-score-mini.negative { color: var(--color-danger); }
.empty-state { padding: var(--gap-md); text-align: center; color: var(--text-muted); font-size: 0.85rem; }
</style>
