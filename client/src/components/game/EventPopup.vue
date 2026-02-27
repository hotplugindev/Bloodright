<template>
  <div class="event-overlay">
    <div class="event-popup panel fade-in">
      <div class="event-header">
        <h2>{{ event.data?.title || event.eventKey }}</h2>
      </div>
      <p class="event-description">{{ event.data?.description || 'An event has occurred...' }}</p>
      <div class="event-options">
        <button
          v-for="(option, idx) in options"
          :key="idx"
          class="option-btn"
          @click="chooseOption(idx)"
          :id="'event-option-' + idx"
        >
          <span class="option-label">{{ option.label }}</span>
          <div class="option-effects">
            <span v-for="(effect, eidx) in option.effects?.slice(0, 3)" :key="eidx" class="effect-tag" :class="effectClass(effect)">
              {{ formatEffect(effect) }}
            </span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../../stores/game';
import { useMultiplayerStore } from '../../stores/multiplayer';

const props = defineProps({ event: Object });
const game = useGameStore();
const mp = useMultiplayerStore();

const options = computed(() => props.event?.data?.options || []);

function chooseOption(idx) {
  const playerChar = game.playerCharacters[0];
  if (playerChar) {
    mp.sendEventChoice(playerChar.id, props.event.eventKey, idx);
    game.clearEvent(props.event.eventKey);
  }
}

function formatEffect(effect) {
  const type = effect.type?.replace('modify_', '').replace(/_/g, ' ');
  const val = effect.value;
  if (val > 0) return `+${val} ${type}`;
  return `${val} ${type}`;
}

function effectClass(effect) {
  if (effect.value > 0) {
    if (effect.type?.includes('stress')) return 'negative';
    return 'positive';
  }
  if (effect.type?.includes('stress')) return 'positive';
  return 'negative';
}
</script>

<style scoped>
.event-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 90;
}

.event-popup {
  max-width: 550px;
  width: 90%;
  padding: var(--gap-xl);
}

.event-header h2 {
  font-size: 1.3rem;
  margin-bottom: var(--gap-md);
  text-align: center;
}

.event-description {
  font-size: 0.9rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: var(--gap-lg);
  text-align: center;
}

.event-options {
  display: flex;
  flex-direction: column;
  gap: var(--gap-sm);
}

.option-btn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  font-family: var(--font-body);
}

.option-btn:hover {
  border-color: var(--gold-primary);
  background: var(--bg-hover);
}

.option-label {
  font-size: 0.9rem;
  font-weight: 500;
}

.option-effects {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.effect-tag {
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: capitalize;
}

.effect-tag.positive { background: rgba(76, 175, 80, 0.15); color: #81c784; }
.effect-tag.negative { background: rgba(244, 67, 54, 0.15); color: #e57373; }
</style>
