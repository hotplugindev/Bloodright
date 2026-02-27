<template>
  <div class="auth-page">
    <div class="auth-card fade-in">
      <h1>⚔️</h1>
      <h2>Enter the Realm</h2>
      <form @submit.prevent="handleLogin" class="auth-form">
        <div class="form-group">
          <label>Username</label>
          <input v-model="username" type="text" class="input" placeholder="Your name, my liege" required id="login-username">
        </div>
        <div class="form-group">
          <label>Password</label>
          <input v-model="password" type="password" class="input" placeholder="••••••••" required id="login-password">
        </div>
        <p v-if="error" class="error-msg">{{ error }}</p>
        <button type="submit" class="btn btn-primary full-width" :disabled="loading" id="login-submit">
          <span v-if="loading" class="spinner"></span>
          <span v-else>Sign In</span>
        </button>
      </form>
      <p class="auth-link">
        New to Bloodright? <router-link to="/register">Create an account</router-link>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(username.value, password.value);
    router.push('/lobby');
  } catch (err) {
    error.value = err.response?.data?.error || 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(ellipse at 50% 50%, rgba(139, 34, 50, 0.1) 0%, transparent 60%),
    var(--bg-dark);
}

.auth-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  padding: 48px 40px;
  width: 100%;
  max-width: 420px;
  text-align: center;
}

.auth-card h1 { font-size: 3rem; margin-bottom: var(--gap-sm); }
.auth-card h2 {
  font-size: 1.5rem;
  margin-bottom: var(--gap-xl);
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
  text-align: left;
}

.form-group label {
  display: block;
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.full-width { width: 100%; }

.error-msg {
  color: var(--color-danger);
  font-size: 0.85rem;
  text-align: center;
}

.auth-link {
  margin-top: var(--gap-lg);
  font-size: 0.85rem;
  color: var(--text-secondary);
}
</style>
