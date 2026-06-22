import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth.store';
import { LoginPage } from '@/pages/LoginPage';
import { CallbackPage } from '@/pages/CallbackPage';
import { GamePage } from '@/pages/GamePage';

/** Protege rotas que exigem autenticação. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando…
      </div>
    );
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/callback" element={<CallbackPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <GamePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
