import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import LoginModal, { type AuthMode } from './LoginModal';
import type { AuthAccountIntent } from '../lib/authRedirect';

export interface AuthModalOptions {
  /** Owner entry points provision/enter a workspace; customer entry points stay on the public journey. */
  accountIntent?: AuthAccountIntent;
  /** Local continuation carried through OAuth/email confirmation. Never authorization. */
  returnTo?: string;
}

interface AuthModalContextValue {
  openAuth: (mode?: AuthMode, options?: AuthModalOptions) => void;
  closeAuth: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

/**
 * Owns the authentication dialog at application-root level.
 *
 * Keeping one dialog outside individual screens means a screen re-render,
 * sticky header, overflow container, or dashboard/wizard switch cannot hide or
 * unmount the form after an account button is clicked. Context is explicit:
 * public-customer entry points never inherit the owner provisioning redirect.
 */
export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialMode, setInitialMode] = useState<AuthMode>('login');
  const [options, setOptions] = useState<Required<AuthModalOptions>>({
    accountIntent: 'owner',
    returnTo: '',
  });

  const openAuth = useCallback((
    mode: AuthMode = 'login',
    nextOptions: AuthModalOptions = {},
  ) => {
    const accountIntent = nextOptions.accountIntent === 'customer' ? 'customer' : 'owner';
    setInitialMode(mode);
    setOptions({
      accountIntent,
      returnTo: nextOptions.returnTo || (accountIntent === 'customer' ? '/' : ''),
    });
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => setOpen(false), []);

  const value = useMemo(() => ({ openAuth, closeAuth }), [openAuth, closeAuth]);

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <LoginModal
        open={open}
        initialMode={initialMode}
        accountIntent={options.accountIntent}
        returnTo={options.returnTo}
        onClose={closeAuth}
      />
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
