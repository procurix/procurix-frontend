// Compatibility barrel. New code should import from a domain client under
// "@/app/services/api/*" so route groups stay small and reviewable.
export * from './api/designs';
export * from './api/parts';
export * from './api/architecture';
export * from './api/nets';
export * from './api/requirements';
export * from './api/subsystems';
export * from './api/chat';
