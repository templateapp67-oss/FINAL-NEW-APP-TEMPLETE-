import { createContext, useContext, type ReactNode } from 'react';

export type SiteRenderMode = 'public' | 'owner-preview';

const SiteRenderModeContext = createContext<SiteRenderMode>('public');

export function SiteRenderModeProvider({
  mode,
  children,
}: {
  mode: SiteRenderMode;
  children: ReactNode;
}) {
  return (
    <SiteRenderModeContext.Provider value={mode}>
      {children}
    </SiteRenderModeContext.Provider>
  );
}

export function useSiteRenderMode(): SiteRenderMode {
  return useContext(SiteRenderModeContext);
}

export function useIsOwnerPreview(): boolean {
  return useSiteRenderMode() === 'owner-preview';
}
