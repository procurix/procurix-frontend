import { createContext, useContext } from 'react';
import type {
  DesignDefinitionResponse,
  DesignLens,
  SelectedEntity,
} from '@/app/services/api/legacy';
import type { ReviewFilter } from './WorkspaceContext';

export interface WorkspaceContextType {
  designId: string;
  definition: DesignDefinitionResponse | null;
  isLoading: boolean;
  error: string | null;
  activeLens: DesignLens;
  setActiveLens: (lens: DesignLens) => void;
  selectedEntity: SelectedEntity | null;
  setSelectedEntity: (entity: SelectedEntity | null) => void;
  reviewFilter: ReviewFilter;
  setReviewFilter: (filter: ReviewFilter) => void;
  refresh: () => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return context;
}
