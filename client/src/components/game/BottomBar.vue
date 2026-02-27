<template>
  <div class="bottom-bar">
    <div class="notifications">
      <div v-for="notif in recentNotifications" :key="notif.id" class="notif-item" :class="notif.type">
        {{ notif.message }}
      </div>
      <span v-if="game.notifications.length === 0" class="notif-empty">No notifications</span>
    </div>
    <div class="bar-right">
      <span class="connection-status" :class="mp.isConnected ? 'online' : 'offline'">
        {{ mp.isConnected ? '🟢 Connected' : '🔴 Disconnected' }}
      </span>
      <span class="player-count">👥 {{ mp.players.length }} player(s)</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useGameStore } from '../../stores/game';
import { useMultiplayerStore } from '../../stores/multiplayer';

const game = useGameStore();
const mp = useMultiplayerStore();

const recentNotifications = computed(() => game.notifications.slice(0, 3));
</script>

<style scoped>
.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 var(--gap-md);
  background: var(--bg-surface);
  border-top: 1px solid var(--border-color);
  font-size: 0.75rem;
  z-index: 20;
}
.notifications { display: flex; gap: var(--gap-md); flex: 1; overflow: hidden; }
.notif-item {
  padding: 2px 8px;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.notif-item.info { color: var(--color-info); }
.notif-item.error { color: var(--color-danger); }
.notif-item.success { color: var(--color-success); }
.notif-empty { color: var(--text-muted); }
.bar-right { display: flex; gap: var(--gap-md); color: var(--text-secondary); }
.connection-status.online { color: var(--color-success); }
.connection-status.offline { color: var(--color-danger); }
</style>
