import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuthStore } from '@/stores/auth.store';
import { Rocket } from 'lucide-react';

/** Tela de Login — redirect para o Keycloak (OIDC code + PKCE S256). */
export function LoginPage() {
  const login = useAuthStore((s) => s.login);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Rocket className="size-8" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Crash Game</h1>
        <p className="max-w-sm text-muted-foreground">
          Aposte, veja o multiplicador subir e saque antes do crash.
        </p>
      </div>

      <Button size="lg" onClick={() => login()} className="min-w-48">
        Entrar com Keycloak
      </Button>

      <p className="text-xs text-muted-foreground">
        Autenticação via OIDC (authorization code + PKCE).
      </p>
    </div>
  );
}
