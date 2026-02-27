import { defineStore } from 'pinia';
import api from '../api/axios';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('bloodright_token') || null,
    user: JSON.parse(localStorage.getItem('bloodright_user') || 'null'),
  }),

  getters: {
    isLoggedIn: (state) => !!state.token,
    username: (state) => state.user?.username || '',
  },

  actions: {
    async register(username, email, password) {
      const { data } = await api.post('/auth/register', { username, email, password });
      this.setAuth(data.token, data.user);
      return data;
    },

    async login(username, password) {
      const { data } = await api.post('/auth/login', { username, password });
      this.setAuth(data.token, data.user);
      return data;
    },

    setAuth(token, user) {
      this.token = token;
      this.user = user;
      localStorage.setItem('bloodright_token', token);
      localStorage.setItem('bloodright_user', JSON.stringify(user));
    },

    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem('bloodright_token');
      localStorage.removeItem('bloodright_user');
    },

    async checkAuth() {
      if (!this.token) return false;
      try {
        const { data } = await api.get('/auth/me');
        this.user = data.user;
        return true;
      } catch {
        this.logout();
        return false;
      }
    },
  },
});
