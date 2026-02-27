<template>
  <div class="lobby-page">
    <header class="lobby-header">
      <h1>⚔️ Bloodright</h1>
      <div class="header-right">
        <span class="username">{{ auth.username }}</span>
        <button class="btn btn-sm" @click="handleLogout" id="logout-btn">Sign Out</button>
      </div>
    </header>

    <div class="lobby-content">
      <div class="lobby-section">
        <h2>Your Sessions</h2>
        <div class="session-list" v-if="sessions.length > 0">
          <div class="session-card" v-for="session in sessions" :key="session.id">
            <div class="session-info">
              <h3>{{ session.savegame?.name || 'Game' }}</h3>
              <span class="session-status" :class="session.status">{{ session.status }}</span>
            </div>
            <div class="session-meta">
              <span>Players: {{ session.users?.length || 0 }}</span>
              <span>Code: <strong>{{ session.inviteCode }}</strong></span>
            </div>
            <button class="btn btn-primary btn-sm" @click="joinGame(session.id)" :id="'join-session-' + session.id">
              {{ session.status === 'lobby' ? 'Enter Lobby' : 'Rejoin' }}
            </button>
          </div>
        </div>
        <p v-else class="empty-state">No active sessions. Create one or join with a code!</p>
      </div>

      <div class="lobby-actions">
        <div class="action-card">
          <h3>⚔️ New Game</h3>
          <p>Start a fresh campaign in a new world</p>
          <div class="form-group">
            <input v-model="newGameName" type="text" class="input" placeholder="Campaign name" id="new-game-name">
          </div>
          <button class="btn btn-primary" @click="createSession" :disabled="creating" id="create-session-btn">
            {{ creating ? 'Creating...' : 'Create Session' }}
          </button>
        </div>

        <div class="action-card">
          <h3>🤝 Join Game</h3>
          <p>Enter a session using an invite code</p>
          <div class="form-group">
            <input v-model="inviteCode" type="text" class="input" placeholder="Enter invite code" id="invite-code-input" 
                   @input="inviteCode = inviteCode.toUpperCase()">
          </div>
          <button class="btn btn-primary" @click="joinByCode" :disabled="joining" id="join-code-btn">
            {{ joining ? 'Joining...' : 'Join Session' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import api from '../api/axios';

const auth = useAuthStore();
const router = useRouter();
const sessions = ref([]);
const newGameName = ref('');
const inviteCode = ref('');
const creating = ref(false);
const joining = ref(false);

onMounted(async () => {
  await loadSessions();
});

async function loadSessions() {
  try {
    const { data } = await api.get('/sessions');
    sessions.value = data.sessions;
  } catch (err) {
    console.error('Failed to load sessions:', err);
  }
}

async function createSession() {
  creating.value = true;
  try {
    const { data } = await api.post('/sessions', { name: newGameName.value || 'New Campaign' });
    await loadSessions();
    router.push(`/game/${data.session.id}`);
  } catch (err) {
    console.error('Failed to create session:', err);
  } finally {
    creating.value = false;
  }
}

async function joinByCode() {
  if (!inviteCode.value) return;
  joining.value = true;
  try {
    const { data } = await api.post('/sessions/join', { inviteCode: inviteCode.value });
    await loadSessions();
    router.push(`/game/${data.session.id}`);
  } catch (err) {
    console.error('Failed to join:', err);
    alert(err.response?.data?.error || 'Failed to join session');
  } finally {
    joining.value = false;
  }
}

function joinGame(sessionId) {
  router.push(`/game/${sessionId}`);
}

function handleLogout() {
  auth.logout();
  router.push('/');
}
</script>

<style scoped>
.lobby-page {
  min-height: 100vh;
  background: var(--bg-dark);
}

.lobby-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--gap-md) var(--gap-xl);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-color);
}

.lobby-header h1 {
  font-size: 1.3rem;
  letter-spacing: 0.1em;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--gap-md);
}

.username {
  color: var(--gold-light);
  font-weight: 600;
}

.lobby-content {
  max-width: 1000px;
  margin: 0 auto;
  padding: var(--gap-xl);
}

.lobby-section { margin-bottom: var(--gap-xl); }
.lobby-section h2 {
  font-size: 1.2rem;
  margin-bottom: var(--gap-md);
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
}

.session-card {
  display: flex;
  align-items: center;
  gap: var(--gap-lg);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  padding: var(--gap-md) var(--gap-lg);
  transition: border-color 0.2s;
}

.session-card:hover { border-color: var(--gold-dark); }
.session-info { flex: 1; }
.session-info h3 { font-size: 1rem; margin-bottom: 2px; }
.session-status {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 10px;
}
.session-status.lobby { background: rgba(66, 165, 245, 0.2); color: var(--color-info); }
.session-status.playing { background: rgba(76, 175, 80, 0.2); color: var(--color-success); }
.session-status.paused { background: rgba(255, 152, 0, 0.2); color: var(--color-warning); }

.session-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.lobby-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--gap-lg);
}

.action-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  padding: var(--gap-lg);
}

.action-card h3 { font-size: 1.1rem; margin-bottom: var(--gap-sm); }
.action-card p { color: var(--text-secondary); font-size: 0.85rem; margin-bottom: var(--gap-md); }
.action-card .form-group { margin-bottom: var(--gap-md); }

.empty-state {
  color: var(--text-muted);
  text-align: center;
  padding: var(--gap-xl);
}
</style>
