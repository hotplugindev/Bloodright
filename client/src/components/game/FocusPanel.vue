<template>
  <div class="panel-content">
    <div class="panel-header"><h3>🎯 Ruler Focus</h3><button class="nav-btn" @click="game.closePanel()">✕</button></div>

    <div v-if="playerChar">
      <div class="current-focus" v-if="currentFocus">
        <div class="focus-active-badge">Active Focus</div>
        <div class="focus-card active">
          <div class="focus-icon">{{ currentFocus.icon }}</div>
          <div class="focus-details">
            <h4>{{ currentFocus.name }}</h4>
            <p>{{ currentFocus.description }}</p>
            <div class="focus-effects">
              <span v-for="(val, key) in currentFocus.effects" :key="key" class="effect-badge">
                {{ formatEffect(key, val) }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div class="current-focus" v-else>
        <div class="no-focus">No focus selected — choose one below</div>
      </div>

      <div class="section">
        <h4>Available Focuses</h4>
        <div class="focus-grid">
          <div v-for="(focus, key) in game.focuses" :key="key"
               class="focus-card"
               :class="{ active: game.playerRulerFocus === key, affordable: playerChar.gold >= focus.cost }"
               @click="selectFocus(key, focus)">
            <div class="focus-icon">{{ focus.icon }}</div>
            <div class="focus-details">
              <h4>{{ focus.name }}</h4>
              <p>{{ focus.description }}</p>
              <div class="focus-effects">
                <span v-for="(val, ekey) in focus.effects" :key="ekey" class="effect-badge">
                  {{ formatEffect(ekey, val) }}
                </span>
              </div>
              <div class="focus-cost" :class="{ cant: playerChar.gold < focus.cost }">
                💰 {{ focus.cost }} gold
              </div>
            </div>
            <div class="focus-active-indicator" v-if="game.playerRulerFocus === key">✓</div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">Select your ruler to change focus</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../../stores/game';
import { useMultiplayerStore } from '../../stores/multiplayer';

const game = useGameStore();
const mp = useMultiplayerStore();

const playerChar = computed(() => game.playerCharacter);
const currentFocus = computed(() => {
  if (!game.playerRulerFocus || !game.focuses) return null;
  return game.focuses[game.playerRulerFocus] || null;
});

function formatEffect(key, val) {
  const labels = {
    tax_mult: 'Tax Income',
    army_maintenance_mult: 'Army Upkeep',
    levy_size_mult: 'Levy Size',
    development_mult: 'Development',
    build_cost_mult: 'Build Cost',
    build_time_mult: 'Build Time',
    piety_mult: 'Piety',
    prestige_mult: 'Prestige',
    opinion_bonus: 'Opinion',
    scheme_power_mult: 'Scheme Power',
    war_score_mult: 'War Score',
    siege_speed_mult: 'Siege Speed',
    innovation_mult: 'Innovation',
  };
  const label = labels[key] || key.replace(/_/g, ' ');
  const sign = val > 0 ? '+' : '';
  const pct = key.includes('bonus') ? '' : '%';
  const display = key.includes('bonus') ? val : (val * 100).toFixed(0);
  return `${label}: ${sign}${display}${pct}`;
}

function selectFocus(key, focus) {
  if (game.playerRulerFocus === key) return;
  if (playerChar.value.gold < focus.cost) return;
  mp.setRulerFocus(key);
}
</script>

<style scoped>
.panel-content { padding: var(--gap-md); }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--gap-md); }
.panel-header h3 { margin: 0; }

.current-focus { margin-bottom: var(--gap-lg); }
.focus-active-badge { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold-light); margin-bottom: 4px; }
.no-focus { padding: 12px; background: var(--bg-hover); border-radius: var(--border-radius); color: var(--text-muted); font-size: 0.85rem; text-align: center; }

.section { margin-bottom: var(--gap-lg); }
.section h4 { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--gap-sm); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }

.focus-grid { display: flex; flex-direction: column; gap: var(--gap-sm); }

.focus-card {
  display: flex;
  gap: var(--gap-sm);
  padding: 10px 12px;
  background: var(--bg-hover);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.focus-card:hover { border-color: var(--gold-dark); }
.focus-card.active { border-color: var(--gold-primary); box-shadow: 0 0 10px var(--gold-glow); }
.focus-card:not(.affordable):not(.active) { opacity: 0.5; cursor: not-allowed; }

.focus-icon { font-size: 1.5rem; padding-top: 2px; }
.focus-details { flex: 1; }
.focus-details h4 { font-size: 0.85rem; margin: 0 0 2px 0; color: var(--text-primary); }
.focus-details p { font-size: 0.7rem; color: var(--text-secondary); margin: 0 0 6px 0; line-height: 1.3; }

.focus-effects { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
.effect-badge { font-size: 0.65rem; padding: 1px 6px; background: var(--bg-dark); border-radius: 8px; color: var(--color-success); }

.focus-cost { font-size: 0.75rem; color: var(--gold-light); }
.focus-cost.cant { color: var(--color-danger); }

.focus-active-indicator {
  position: absolute;
  top: 6px;
  right: 8px;
  font-size: 1rem;
  color: var(--gold-primary);
  font-weight: bold;
}

.empty-state { padding: var(--gap-xl); text-align: center; color: var(--text-muted); }
</style>
