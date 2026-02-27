<template>
  <div class="panel-content">
    <div class="panel-header"><h3>👥 Population</h3><button class="nav-btn" @click="game.closePanel()">✕</button></div>

    <div v-if="isPlayerChar">
      <div class="pop-summary">
        <span>Total inhabitants: <strong>{{ populations.length }}</strong></span>
      </div>

      <!-- Court Roles -->
      <div class="section">
        <h4>Court Council</h4>
        <div class="role-grid">
          <div v-for="role in roles" :key="role.key" class="role-slot">
            <div class="role-header">
              <span class="role-icon">{{ role.icon }}</span>
              <span class="role-name">{{ role.label }}</span>
            </div>
            <div v-if="getAssignedPop(role.key)" class="role-assigned">
              <span>{{ getAssignedPop(role.key).firstName }} {{ getAssignedPop(role.key).lastName }}</span>
              <span class="role-stat">{{ role.stat }}: {{ getAssignedPop(role.key)[role.statKey] }}</span>
              <button class="btn-sm" @click="unassignRole(getAssignedPop(role.key).id)">✕</button>
            </div>
            <div v-else class="role-empty">
              <select @change="onAssignRole($event, role.key)">
                <option value="">— Assign —</option>
                <option v-for="pop in unassignedPops" :key="pop.id" :value="pop.id">
                  {{ pop.firstName }} {{ pop.lastName }} ({{ role.stat }}: {{ pop[role.statKey] }})
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Marriage Candidates -->
      <div class="section" v-if="!playerChar?.spouseId">
        <h4>💍 Marriage Candidates</h4>
        <div class="pop-list">
          <div v-for="pop in marriageCandidates" :key="pop.id" class="pop-card">
            <div class="pop-info">
              <span class="pop-name">{{ pop.isMale ? '👤' : '👩' }} {{ pop.firstName }} {{ pop.lastName }}</span>
              <span class="pop-age">Age {{ getAge(pop) }}</span>
            </div>
            <div class="pop-stats">
              <span>⚔ {{ pop.martial }}</span>
              <span>💰 {{ pop.stewardship }}</span>
              <span>🗡 {{ pop.intrigue }}</span>
              <span>📚 {{ pop.learning }}</span>
            </div>
            <button class="action-btn" @click="marryPop(pop.id)">💍 Marry</button>
          </div>
        </div>
        <p v-if="marriageCandidates.length === 0" class="empty-state">No eligible candidates</p>
      </div>

      <!-- All Population -->
      <div class="section">
        <h4>All Inhabitants</h4>
        <div class="pop-list">
          <div v-for="pop in sortedPopulations" :key="pop.id" class="pop-card mini">
            <div class="pop-info">
              <span class="pop-name">{{ pop.isMale ? '👤' : '👩' }} {{ pop.firstName }} {{ pop.lastName }}</span>
              <span class="pop-age">Age {{ getAge(pop) }}</span>
              <span class="pop-role" v-if="pop.role">{{ pop.role.replace(/_/g, ' ') }}</span>
            </div>
            <div class="pop-stats">
              <span>⚔ {{ pop.martial }}</span>
              <span>💰 {{ pop.stewardship }}</span>
              <span>🗡 {{ pop.intrigue }}</span>
              <span>📚 {{ pop.learning }}</span>
              <span>🛡 {{ pop.prowess }}</span>
            </div>
            <div class="pop-traits" v-if="pop.traits?.length">
              <span v-for="t in pop.traits.slice(0, 3)" :key="t" class="trait-badge">{{ t }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">Select your ruler to manage population</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../../stores/game';
import { useMultiplayerStore } from '../../stores/multiplayer';

const game = useGameStore();
const mp = useMultiplayerStore();

const playerChar = computed(() => game.playerCharacter);
const isPlayerChar = computed(() => !!game.playerCharacterId);

const populations = computed(() => game.playerPopulations);

const sortedPopulations = computed(() =>
  [...populations.value].sort((a, b) => {
    if (a.role && !b.role) return -1;
    if (!a.role && b.role) return 1;
    return (b.martial + b.stewardship + b.intrigue + b.learning) -
           (a.martial + a.stewardship + a.intrigue + a.learning);
  })
);

const unassignedPops = computed(() => populations.value.filter((p) => !p.role));

const marriageCandidates = computed(() => {
  const pc = playerChar.value;
  if (!pc) return [];
  return populations.value.filter((p) =>
    p.isMale !== pc.isMale && !p.spouseId && getAge(p) >= 16 && getAge(p) <= 45
  );
});

const roles = [
  { key: 'marshal', label: 'Marshal', icon: '⚔️', stat: 'Martial', statKey: 'martial' },
  { key: 'steward', label: 'Steward', icon: '💰', stat: 'Stewardship', statKey: 'stewardship' },
  { key: 'spymaster', label: 'Spymaster', icon: '🗡️', stat: 'Intrigue', statKey: 'intrigue' },
  { key: 'chancellor', label: 'Chancellor', icon: '🕊️', stat: 'Learning', statKey: 'learning' },
  { key: 'court_physician', label: 'Physician', icon: '🏥', stat: 'Learning', statKey: 'learning' },
  { key: 'knight', label: 'Knight', icon: '🛡️', stat: 'Prowess', statKey: 'prowess' },
];

function getAge(pop) {
  return Math.floor((game.gameDate - pop.birthDate) / 365);
}

function getAssignedPop(roleKey) {
  return populations.value.find((p) => p.role === roleKey);
}

function onAssignRole(event, roleKey) {
  const popId = parseInt(event.target.value);
  if (popId) {
    mp.assignRole(popId, roleKey);
  }
  event.target.value = '';
}

function unassignRole(popId) {
  mp.assignRole(popId, null);
}

function marryPop(popId) {
  mp.marryPopulation(popId);
}
</script>

<style scoped>
.panel-content { padding: var(--gap-md); }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--gap-md); }
.panel-header h3 { margin: 0; }

.pop-summary { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: var(--gap-md); padding: 8px; background: var(--bg-hover); border-radius: var(--border-radius); }

.section { margin-bottom: var(--gap-lg); }
.section h4 { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--gap-sm); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }

.role-grid { display: flex; flex-direction: column; gap: var(--gap-sm); }
.role-slot { background: var(--bg-hover); border-radius: var(--border-radius); padding: 8px 10px; }
.role-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.role-icon { font-size: 1rem; }
.role-name { font-size: 0.8rem; font-weight: 600; color: var(--gold-light); }
.role-assigned { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; }
.role-stat { color: var(--text-muted); font-size: 0.7rem; margin-left: auto; }
.role-empty select { width: 100%; background: var(--bg-dark); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: var(--border-radius); padding: 4px; font-size: 0.75rem; font-family: var(--font-body); }

.btn-sm { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 0.7rem; padding: 2px 4px; }
.btn-sm:hover { color: var(--color-danger); }

.pop-list { display: flex; flex-direction: column; gap: var(--gap-xs); max-height: 300px; overflow-y: auto; }
.pop-card { background: var(--bg-hover); border-radius: var(--border-radius); padding: 8px 10px; }
.pop-card.mini { padding: 6px 8px; }
.pop-info { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }
.pop-name { font-size: 0.8rem; font-weight: 500; }
.pop-age { font-size: 0.7rem; color: var(--text-muted); }
.pop-role { font-size: 0.65rem; color: var(--gold-light); background: var(--bg-dark); padding: 1px 6px; border-radius: 8px; text-transform: capitalize; }
.pop-stats { display: flex; gap: 8px; font-size: 0.7rem; color: var(--text-secondary); }
.pop-traits { display: flex; gap: 3px; margin-top: 3px; flex-wrap: wrap; }

.action-btn { margin-top: 4px; padding: 4px 10px; background: var(--bg-dark); border: 1px solid var(--border-color); border-radius: var(--border-radius); color: var(--text-primary); cursor: pointer; font-size: 0.75rem; font-family: var(--font-body); transition: all 0.2s; }
.action-btn:hover { border-color: var(--gold-dark); background: var(--bg-surface); }

.empty-state { padding: var(--gap-md); text-align: center; color: var(--text-muted); font-size: 0.85rem; }
</style>
