import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';

/** Trata o retorno do Keycloak: troca o code por tokens e hidrata o auth store. */
export function CallbackPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    authService
      .handleCallback()
      .then((user) => {
        setUser(user);
        navigate('/', { replace: true });
      })
      .catch(() => {
        setError('Falha ao autenticar. Tente novamente.');
      });
  }, [navigate, setUser]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      {error ? (
        <>
          <p className="text-destructive">{error}</p>
          <button
            className="text-sm text-primary underline"
            onClick={() => navigate('/login', { replace: true })}
          >
            Voltar ao login
          </button>
        </>
      ) : (
        <p className="text-muted-foreground">Autenticando…</p>
      )}
    </div>
  );
}
