<template>
  <div class="panel-content">
    <div class="panel-header">
      <h3>👑 Dynasty</h3>
      <button class="nav-btn" @click="game.closePanel()">✕</button>
    </div>
    <div v-if="dynasty">
      <div class="dynasty-header">
        <h2>House {{ dynasty.name }}</h2>
        <p v-if="dynasty.motto" class="motto">"{{ dynasty.motto }}"</p>
        <div class="dynasty-stats">
          <span class="resource renown">✨ {{ Math.floor(dynasty.renown) }} Renown</span>
          <span>Members: {{ livingMembers.length }}</span>
        </div>
      </div>
      <div class="section">
        <h4>Family Tree</h4>
        <div class="tree-view">
          <div v-for="member in treeMembers" :key="member.id"
               class="tree-member" :class="{ dead: !member.isAlive }"
               :style="{ paddingLeft: (member.depth || 0) * 20 + 'px' }"
               @click="game.selectCharacter(member.id)">
            <span class="tree-icon">{{ member.isMale ? '👤' : '👩' }}</span>
            <span class="tree-name">{{ member.firstName }} {{ member.lastName }}</span>
            <span class="tree-titles" v-if="getMemberTitles(member.id)">{{ getMemberTitles(member.id) }}</span>
            <span class="tree-dead" v-if="!member.isAlive">†</span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="empty-state">No dynasty selected</div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../../stores/game';
const game = useGameStore();

const dynasty = computed(() => {
  const char = game.selectedCharacter;
  if (!char?.dynastyId) return null;
  return game.dynasties.find((d) => d.id === char.dynastyId);
});

const livingMembers = computed(() => game.characters.filter((c) => c.dynastyId === dynasty.value?.id && c.isAlive));

const treeMembers = computed(() => {
  if (!dynasty.value) return [];
  const members = game.characters.filter((c) => c.dynastyId === dynasty.value.id);
  const roots = members.filter((m) => !m.fatherId || !members.find((p) => p.id === m.fatherId));
  const result = [];
  function walk(member, depth) {
    result.push({ ...member, depth });
    const children = members.filter((c) => c.fatherId === member.id);
    children.forEach((c) => walk(c, depth + 1));
  }
  roots.forEach((r) => walk(r, 0));
  return result;
});

function getMemberTitles(charId) {
  return game.titles
    .filter((t) => t.holderId === charId && ['duchy', 'kingdom', 'empire'].includes(t.tier))
    .map((t) => t.name)
    .join(', ');
}
</script>

<style scoped>
.panel-content { padding: var(--gap-md); }
.dynasty-header { margin-bottom: var(--gap-lg); }
.dynasty-header h2 { font-size: 1.2rem; }
.motto { font-style: italic; color: var(--text-secondary); font-size: 0.85rem; margin: 4px 0; }
.dynasty-stats { display: flex; gap: var(--gap-lg); font-size: 0.85rem; color: var(--text-secondary); margin-top: var(--gap-sm); }
.section { margin-bottom: var(--gap-lg); }
.section h4 { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: var(--gap-sm); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; }
.tree-view { max-height: 400px; overflow-y: auto; }
.tree-member { display: flex; align-items: center; gap: var(--gap-sm); padding: 4px 8px; font-size: 0.8rem; border-radius: var(--border-radius); cursor: pointer; transition: background 0.15s; }
.tree-member:hover { background: var(--bg-hover); }
.tree-member.dead { opacity: 0.5; }
.tree-icon { font-size: 1rem; }
.tree-name { font-weight: 500; }
.tree-titles { color: var(--tier-kingdom); font-size: 0.7rem; }
.tree-dead { color: var(--color-danger); }
.empty-state { padding: var(--gap-xl); text-align: center; color: var(--text-muted); }
</style>
