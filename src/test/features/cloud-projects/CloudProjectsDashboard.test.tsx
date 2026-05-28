import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudProjectsDashboard } from '../../../features/cloud-projects/CloudProjectsDashboard';
import { useCloudProjectStore } from '../../../store/cloudProjectStore';

vi.mock('../../../features/cloud-projects/cloudProjects', async () => {
  const actual = await vi.importActual<typeof import('../../../features/cloud-projects/cloudProjects')>(
    '../../../features/cloud-projects/cloudProjects'
  );
  return {
    ...actual,
    fetchCloudProjects: vi.fn().mockResolvedValue([
      {
        id: 'project-1',
        organization_id: 'org-1',
        name: 'Mariage Laura & Maxime',
        project_type: 'wedding',
        status: 'active',
        created_at: '2026-01-01T10:00:00.000Z',
        updated_at: '2026-01-03T10:00:00.000Z',
        stats: {
          totalPhotos: 12,
          analyzed: 10,
          review: 2,
          picks: 6,
          rejected: 3,
        },
      },
      {
        id: 'project-2',
        organization_id: 'org-1',
        name: 'Reportage studio',
        project_type: 'portrait',
        status: 'active',
        created_at: '2026-01-02T10:00:00.000Z',
        updated_at: '2026-01-02T10:00:00.000Z',
        stats: {
          totalPhotos: 4,
          analyzed: 1,
          review: 1,
          picks: 1,
          rejected: 0,
        },
      },
    ]),
    createCloudProject: vi.fn(),
  };
});

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CloudProjectsDashboard userId="user-1" />
    </QueryClientProvider>
  );
}

describe('CloudProjectsDashboard', () => {
  beforeEach(() => {
    useCloudProjectStore.getState().clearActiveProject();
  });

  it('sets the first loaded project as active, then updates active project on selection', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(useCloudProjectStore.getState().activeProject).toEqual({
        id: 'project-1',
        organizationId: 'org-1',
        name: 'Mariage Laura & Maxime',
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /Reportage studio/i }));

    expect(useCloudProjectStore.getState().activeProject).toEqual({
      id: 'project-2',
      organizationId: 'org-1',
      name: 'Reportage studio',
    });
  });
});
