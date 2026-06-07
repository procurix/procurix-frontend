import { createContext, useContext } from 'react';

export interface WithImpactPreviewOptions<T> {
  action: string;
  target: Record<string, unknown>;
  designId: string;
  verb: string;
  apply: () => Promise<T>;
  forcePopup?: boolean;
}

interface ImpactPreviewContextValue {
  withImpactPreview: <T>(opts: WithImpactPreviewOptions<T>) => Promise<T>;
}

export const ImpactPreviewContext = createContext<ImpactPreviewContextValue | null>(null);

export function useImpactPreview() {
  const ctx = useContext(ImpactPreviewContext);
  if (!ctx) throw new Error('useImpactPreview must be used within ImpactPreviewProvider');
  return ctx;
}

export class ImpactCancelledError extends Error {
  constructor(verb: string) {
    super(`User cancelled: ${verb}`);
    this.name = 'ImpactCancelledError';
  }
}
