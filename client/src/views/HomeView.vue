<template>
  <div class="home-page">
    <div class="hero">
      <div class="hero-decoration"></div>
      <div class="hero-content fade-in">
        <div class="crown-icon">⚔️</div>
        <h1 class="title">Bloodright</h1>
        <p class="subtitle">A Dynasty Game</p>
        <p class="tagline">Forge alliances. Wage wars. Build your legacy.</p>
        <div class="hero-actions">
          <router-link to="/login" class="btn btn-primary" v-if="!auth.isLoggedIn">
            Enter the Realm
          </router-link>
          <router-link to="/lobby" class="btn btn-primary" v-else>
            Continue to Lobby
          </router-link>
          <router-link to="/register" class="btn" v-if="!auth.isLoggedIn">
            Create Account
          </router-link>
        </div>
      </div>
      <div class="hero-features">
        <div class="feature-card" v-for="f in features" :key="f.icon">
          <div class="feature-icon">{{ f.icon }}</div>
          <h3>{{ f.title }}</h3>
          <p>{{ f.desc }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useAuthStore } from '../stores/auth';
const auth = useAuthStore();

const features = [
  { icon: '👑', title: 'Dynasty', desc: 'Build a lasting legacy across generations' },
  { icon: '⚔️', title: 'Warfare', desc: 'Command armies and conquer territories' },
  { icon: '🤝', title: 'Diplomacy', desc: 'Forge alliances through marriage and treaty' },
  { icon: '🗡️', title: 'Intrigue', desc: 'Plot, scheme, and manipulate from the shadows' },
  { icon: '⛪', title: 'Faith', desc: 'Wield religious authority and piety' },
  { icon: '🌍', title: 'Multiplayer', desc: 'Rule alongside friends in real-time' },
];
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(139, 34, 50, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse at 70% 80%, rgba(196, 163, 90, 0.1) 0%, transparent 50%),
    var(--bg-dark);
}

.hero {
  text-align: center;
  max-width: 900px;
  padding: var(--gap-xl);
}

.crown-icon {
  font-size: 4rem;
  margin-bottom: var(--gap-md);
  filter: drop-shadow(0 0 20px rgba(196, 163, 90, 0.5));
}

.title {
  font-size: 4rem;
  font-weight: 900;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  background: linear-gradient(135deg, var(--gold-dark), var(--gold-light), var(--gold-primary));
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: goldShimmer 4s linear infinite;
  margin-bottom: var(--gap-xs);
}

.subtitle {
  font-family: var(--font-display);
  font-size: 1.3rem;
  color: var(--text-secondary);
  letter-spacing: 0.3em;
  text-transform: uppercase;
  margin-bottom: var(--gap-lg);
}

.tagline {
  font-size: 1.1rem;
  color: var(--text-muted);
  margin-bottom: var(--gap-xl);
}

.hero-actions {
  display: flex;
  gap: var(--gap-md);
  justify-content: center;
  margin-bottom: 60px;
}

.hero-features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--gap-md);
}

.feature-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  padding: var(--gap-lg);
  transition: all 0.3s ease;
}

.feature-card:hover {
  border-color: var(--gold-primary);
  transform: translateY(-4px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
}

.feature-icon {
  font-size: 2rem;
  margin-bottom: var(--gap-sm);
}

.feature-card h3 {
  font-size: 0.9rem;
  margin-bottom: var(--gap-xs);
}

.feature-card p {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .title { font-size: 2.5rem; }
  .hero-features { grid-template-columns: repeat(2, 1fr); }
}
</style>
