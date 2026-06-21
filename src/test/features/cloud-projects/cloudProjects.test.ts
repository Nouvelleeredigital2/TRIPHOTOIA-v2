import { describe, expect, it, vi } from 'vitest';
import {
  archiveCloudProject,
  buildProjectStats,
  describeCloudProjectError,
  mapCloudPhotoRows,
  renameCloudProject,
  setCloudPhotoDeleted,
  sortProjectsByRecentActivity,
  type CloudPhotoRow,
  type CloudProjectRow,
} from '../../../features/cloud-projects/cloudProjects';
import type { SupabaseClient } from '@supabase/supabase-js';

const mockClient = (rpc: ReturnType<typeof vi.fn>) =>
  ({ rpc }) as unknown as SupabaseClient;

const projects: CloudProjectRow[] = [
  {
    id: 'project-old',
    organization_id: 'org-1',
    name: 'Mariage ancien',
    project_type: 'wedding',
    status: 'active',
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-02T10:00:00.000Z',
  },
  {
    id: 'project-new',
    organization_id: 'org-1',
    name: 'Mariage recent',
    project_type: 'wedding',
    status: 'active',
    created_at: '2026-02-01T10:00:00.000Z',
    updated_at: '2026-02-03T10:00:00.000Z',
  },
];

describe('cloud project helpers', () => {
  it('builds project dashboard stats from cloud photo rows', () => {
    const photos: CloudPhotoRow[] = [
      {
        project_id: 'project-new',
        pick_status: 'pick',
        analysis_status: 'completed',
        is_deleted: false,
      },
      {
        project_id: 'project-new',
        pick_status: 'pick',
        analysis_status: 'completed',
        is_deleted: false,
      },
      {
        project_id: 'project-new',
        pick_status: 'reject',
        analysis_status: 'pending',
        is_deleted: false,
      },
      {
        project_id: 'project-new',
        pick_status: 'review',
        analysis_status: 'completed',
        is_deleted: false,
      },
      {
        project_id: 'project-new',
        pick_status: 'unreviewed',
        analysis_status: 'pending',
        is_deleted: true,
      },
      {
        project_id: 'project-old',
        pick_status: 'reject',
        analysis_status: 'completed',
        is_deleted: false,
      },
    ];

    expect(buildProjectStats('project-new', photos)).toEqual({
      totalPhotos: 4,
      analyzed: 3,
      review: 1,
      picks: 2,
      rejected: 1,
    });
  });

  it('sorts projects by latest update first', () => {
    expect(
      sortProjectsByRecentActivity(projects).map((project) => project.id)
    ).toEqual(['project-new', 'project-old']);
  });

  it('renames a project via the SECURITY DEFINER RPC (A-39)', async () => {
    const rpc = vi.fn().mockResolvedValue({
      // La RPC renvoie la ligne projet complète (validée par Zod, P1-7).
      data: {
        id: 'p1',
        organization_id: 'o1',
        name: 'Nouveau',
        project_type: 'wedding',
        status: 'active',
        created_at: '2026-06-22T00:00:00Z',
        updated_at: '2026-06-22T00:00:00Z',
      },
      error: null,
    });
    const row = await renameCloudProject('p1', '  Nouveau  ', mockClient(rpc));
    expect(rpc).toHaveBeenCalledWith('rename_user_project', {
      p_project_id: 'p1',
      p_name: 'Nouveau',
    });
    expect(row.name).toBe('Nouveau');
  });

  it('archives a project via RPC (A-39)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await archiveCloudProject('p1', mockClient(rpc));
    expect(rpc).toHaveBeenCalledWith('archive_user_project', {
      p_project_id: 'p1',
    });
  });

  it('soft-deletes a cloud photo via RPC (A-42)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    await setCloudPhotoDeleted('photo-1', true, mockClient(rpc));
    expect(rpc).toHaveBeenCalledWith('set_cloud_photo_deleted', {
      p_photo_id: 'photo-1',
      p_deleted: true,
    });
  });

  it('throws the RPC error so the UI can surface it', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('duplicate_name') });
    await expect(
      renameCloudProject('p1', 'X', mockClient(rpc))
    ).rejects.toThrow('duplicate_name');
  });

  it('maps known RPC errors to readable messages (A-40)', () => {
    expect(describeCloudProjectError(new Error('duplicate_name'))).toBe(
      'Un projet porte déjà ce nom.'
    );
    expect(describeCloudProjectError(new Error('not_authorized'))).toBe(
      "Vous n'avez pas accès à ce projet."
    );
    expect(describeCloudProjectError(new Error('boom'))).toBe('boom');
  });

  it('maps cloud photo rows for dashboard display', () => {
    expect(
      mapCloudPhotoRows([
        {
          id: 'photo-1',
          project_id: 'project-new',
          original_filename: 'Laura 01.jpg',
          storage_path:
            'organizations/org-1/projects/project-new/originals/photo-1-Laura-01.jpg',
          thumbnail_path: null,
          pick_status: 'unreviewed',
          analysis_status: 'pending',
          is_deleted: false,
          created_at: '2026-02-03T10:00:00.000Z',
        },
      ])
    ).toEqual([
      {
        id: 'photo-1',
        projectId: 'project-new',
        originalFilename: 'Laura 01.jpg',
        storagePath:
          'organizations/org-1/projects/project-new/originals/photo-1-Laura-01.jpg',
        thumbnailPath: null,
        pickStatus: 'unreviewed',
        analysisStatus: 'pending',
        createdAt: '2026-02-03T10:00:00.000Z',
      },
    ]);
  });
});
