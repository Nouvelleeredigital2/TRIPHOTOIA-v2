import { create } from 'zustand';

export interface ActiveCloudProject {
  id: string;
  organizationId: string;
  name: string;
}

interface CloudProjectState {
  activeProject: ActiveCloudProject | null;
  setActiveProject: (project: ActiveCloudProject) => void;
  clearActiveProject: () => void;
}

export const useCloudProjectStore = create<CloudProjectState>((set) => ({
  activeProject: null,
  setActiveProject: (project) => set({ activeProject: project }),
  clearActiveProject: () => set({ activeProject: null }),
}));
