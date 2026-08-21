import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import LoginModal, { type AuthMode } from './LoginModal';

interface AuthModalContextValue {
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

/**
 * Owns the authentication dialog at application-root level.
 *
 * Keeping one dialog outside individual screens means a screen re-render,
 * sticky header, overflow container, or dashboard/wizard switch cannot hide or
 * unmount the form after an account button is clicked.
 */
export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialMode, setInitialMode] = useState<AuthMode>('login');

  const openAuth = useCallback((mode: AuthMode = 'login') => {
    setInitialMode(mode);
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ openAuth, closeAuth }), [openAuth, closeAuth]);

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <LoginModal open={open} initialMode={initialMode} onClose={closeAuth} />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal(): AuthModalContextValue {
  const context = useContext(AuthModalContext);
  if (!context) {
    throw new Error('useAuthModal must be used inside AuthModalProvider.');
  }
  return context;
}
