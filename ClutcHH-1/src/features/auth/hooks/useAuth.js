import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/app/routes/paths';
import useSessionStore from '@/app/store/useSessionStore';
import { authService } from '../services/authService';

export default function useAuth() {
  const navigate = useNavigate();
  const { user, isAuthenticated, signIn, signOut } = useSessionStore();

  const login = useCallback(
    async (credentials) => {
      const u = await authService.signIn(credentials);
      signIn(u);
      navigate(ROUTES.home);
      return u;
    },
    [signIn, navigate],
  );

  const logout = useCallback(async () => {
    await authService.signOut();
    signOut();
    navigate(ROUTES.login);
  }, [signOut, navigate]);

  return { user, isAuthenticated, login, logout };
}
