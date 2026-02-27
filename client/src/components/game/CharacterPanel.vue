<template>
  <div class="panel-content">
    <div class="panel-header">
      <h3>👤 Character</h3>
      <button class="nav-btn" @click="game.closePanel()">✕</button>
    </div>

    <div v-if="char" class="character-detail">
      <div class="char-identity">
        <div class="portrait">{{ char.isMale ? '👤' : '👩' }}</div>
        <div>
          <h2>{{ char.firstName }} {{ char.lastName }}</h2>
          <div class="char-titles">{{ charTitles }}</div>
          <div class="char-dynasty" v-if="dynasty">House {{ dynasty.name }}</div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-item" v-for="stat in stats" :key="stat.key">
          <span class="stat-icon">{{ stat.icon }}</span>
          <span class="stat-label">{{ stat.label }}</span>
          <span class="stat-value">{{ char[stat.key] }}</span>
        </div>
      </div>

      <div class="section">
        <h4>Vitals</h4>
        <div class="vital-row">
          <span>❤️ Health</span>
          <div class="vital-bar"><div class="vital-fill health" :style="{ width: (char.health / 8 * 100) + '%' }"></div></div>
          <span>{{ char.health?.toFixed(1) }}</span>
        </div>
        <div class="vital-row">
          <span>😰 Stress</span>
          <div class="vital-bar"><div class="vital-fill stress" :style="{ width: char.stress + '%' }"></div></div>
          <span>{{ char.stress }}/100</span>
        </div>
        <div class="vital-row">
          <span>👶 Fertility</span>
          <div class="vital-bar"><div class="vital-fill fertility" :style="{ width: (char.fertility * 100) + '%' }"></div></div>
          <span>{{ (char.fertility * 100).toFixed(0) }}%</span>
        </div>
      </div>

      <div class="section" v-if="char.traits?.length">
        <h4>Traits</h4>
        <div class="traits-list">
          <span v-for="trait in char.traits" :key="trait.traitKey || trait" class="trait-badge" :class="traitClass(trait)">
            {{ traitName(trait) }}
          </span>
        </div>
      </div>

      <div class="section">
        <h4>Lifestyle</h4>
        <div class="lifestyle-info">
          <span>Focus: {{ char.lifestyleFocus || 'None' }}</span>
        </div>
      </div>

      <div class="section" v-if="children.length">
        <h4>Children ({{ children.length }})</h4>
        <div class="family-list">
          <div v-for="child in children" :key="child.id" class="family-member" @click="game.selectCharacter(child.id)">
            <span>{{ child.isMale ? '👤' : '👩' }}</span>
            <span>{{ child.firstName }} {{ child.lastName }}</span>
            <span class="age" v-if="child.isAlive">alive</span>
            <span class="dead" v-else>†</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">Select a character to view details</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../../stores/game';

const game = useGameStore();

const char = computed(() => game.selectedCharacter);
const dynasty = computed(() => char.value?.dynastyId ? game.dynasties.find((d) => d.id === char.value.dynastyId) : null);
const children = computed(() => game.characters.filter((c) => c.fatherId === char.value?.id));
const charTitles = computed(() => {
  if (!char.value) return '';
  return game.titles
    .filter((t) => t.holderId === char.value.id && t.tier !== 'barony')
    .map((t) => t.name)
    .join(', ') || 'No titles';
});

const stats = [
  { key: 'diplomacy', label: 'Diplomacy', icon: '🕊️' },
  { key: 'martial', label: 'Martial', icon: '⚔️' },
  { key: 'stewardship', label: 'Stewardship', icon: '💰' },
  { key: 'intrigue', label: 'Intrigue', icon: '🗡️' },
  { key: 'learning', label: 'Learning', icon: '📚' },
  { key: 'prowess', label: 'Prowess', icon: '🛡️' },
];

function traitName(trait) {
  const key = trait.traitKey || trait;
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

function traitClass(trait) {
  const key = trait.traitKey || trait;
  const positive = ['brave', 'ambitious', 'just', 'patient', 'diligent', 'generous', 'genius', 'intelligent', 'strong', 'beautiful'];
  const genetic = ['genius', 'intelligent', 'dull', 'strong', 'weak', 'beautiful', 'ugly'];
  if (genetic.includes(key)) return 'genetic';
  if (positive.includes(key)) return 'positive';
  return 'negative';
}
</script>

<style scoped>
.panel-content { padding: var(--gap-md); }

.char-identity {
  display: flex;
  gap: var(--gap-md);
  align-items: center;
  margin-bottom: var(--gap-lg);
}

.portrait {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  background: var(--bg-hover);
  border: 2px solid var(--gold-dark);
  border-radius: 50%;
}

.char-identity h2 { font-size: 1.1rem; margin-bottom: 2px; }
.char-titles { font-size: 0.8rem; color: var(--tier-kingdom); }
.char-dynasty { font-size: 0.75rem; color: var(--text-secondary); }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--gap-sm);
  margin-bottom: var(--gap-lg);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--bg-hover);
  border-radius: var(--border-radius);
  font-size: 0.8rem;
}

.stat-icon { font-size: 0.9rem; }
.stat-label { color: var(--text-secondary); font-size: 0.7rem; flex: 1; }
.stat-value { font-weight: 700; color: var(--gold-light); }

.section { margin-bottom: var(--gap-lg); }
.section h4 {
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--gap-sm);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 4px;
}

.vital-row {
  display: flex;
  align-items: center;
  gap: var(--gap-sm);
  font-size: 0.8rem;
  margin-bottom: 4px;
}

.vital-row > span:first-child { width: 90px; }
.vital-row > span:last-child { width: 50px; text-align: right; color: var(--text-secondary); }

.vital-bar {
  flex: 1;
  height: 6px;
  background: var(--bg-dark);
  border-radius: 3px;
  overflow: hidden;
}

.vital-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.vital-fill.health { background: linear-gradient(90deg, #f44336, #4caf50); }
.vital-fill.stress { background: linear-gradient(90deg, #4caf50, #ff9800, #f44336); }
.vital-fill.fertility { background: #ce93d8; }

.traits-list { display: flex; flex-wrap: wrap; gap: 4px; }

.family-list { display: flex; flex-direction: column; gap: 2px; }
.family-member {
  display: flex;
  gap: var(--gap-sm);
  padding: 4px 8px;
  font-size: 0.8rem;
  border-radius: var(--border-radius);
  cursor: pointer;
}
.family-member:hover { background: var(--bg-hover); }
.family-member .dead { color: var(--color-danger); }

.empty-state { padding: var(--gap-xl); text-align: center; color: var(--text-muted); }
</style>
