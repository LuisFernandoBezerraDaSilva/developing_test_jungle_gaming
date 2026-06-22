import { create } from 'zustand';
import { authService, type AuthUser } from '@/services/auth.service';

/**
 * Client state da autenticação (Zustand). A fonte real é o `authService`
 * (oidc-client-ts); este store só espelha o usuário atual para a UI.
 */

type AuthState = {
  user: AuthUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  bootstrap: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'loading',

  async bootstrap() {
    const user = await authService.getUser();
    set({ user, status: user ? 'authenticated' : 'anonymous' });
  },

  setUser(user) {
    set({ user, status: user ? 'authenticated' : 'anonymous' });
  },

  login() {
    return authService.login();
  },

  async logout() {
    await authService.logout();
    set({ user: null, status: 'anonymous' });
  },
}));
