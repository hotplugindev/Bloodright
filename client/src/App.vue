<template>
  <div id="bloodright-app" :class="{ 'in-game': isInGame }">
    <router-view />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const isInGame = computed(() => route.path.startsWith('/game'));
</script>

<style>
#bloodright-app {
  min-height: 100vh;
  background: var(--bg-dark);
  color: var(--text-primary);
}

#bloodright-app.in-game {
  overflow: hidden;
  height: 100vh;
}
</style>
