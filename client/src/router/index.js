import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/HomeView.vue'),
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/RegisterView.vue'),
  },
  {
    path: '/lobby',
    name: 'Lobby',
    component: () => import('../views/LobbyView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/game/:sessionId',
    name: 'Game',
    component: () => import('../views/GameView.vue'),
    meta: { requiresAuth: true },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  if (to.meta.requiresAuth) {
    const auth = useAuthStore();
    if (!auth.token) {
      next({ name: 'Login' });
      return;
    }
  }
  next();
});

export default router;
