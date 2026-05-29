import { describe, expect, it } from 'vitest';
import {
  buildProjectStats,
  mapCloudPhotoRows,
  sortProjectsByRecentActivity,
  type CloudPhotoRow,
  type CloudProjectRow,
} from '../../../features/cloud-projects/cloudProjects';

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
      { project_id: 'project-new', pick_status: 'pick', analysis_status: 'completed', is_deleted: false },
      { project_id: 'project-new', pick_status: 'pick', analysis_status: 'completed', is_deleted: false },
      { project_id: 'project-new', pick_status: 'reject', analysis_status: 'pending', is_deleted: false },
      { project_id: 'project-new', pick_status: 'review', analysis_status: 'completed', is_deleted: false },
      { project_id: 'project-new', pick_status: 'unreviewed', analysis_status: 'pending', is_deleted: true },
      { project_id: 'project-old', pick_status: 'reject', analysis_status: 'completed', is_deleted: false },
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
    expect(sortProjectsByRecentActivity(projects).map((project) => project.id)).toEqual([
      'project-new',
      'project-old',
    ]);
  });

  it('maps cloud photo rows for dashboard display', () => {
    expect(mapCloudPhotoRows([
      {
        id: 'photo-1',
        project_id: 'project-new',
        original_filename: 'Laura 01.jpg',
        storage_path: 'organizations/org-1/projects/project-new/originals/photo-1-Laura-01.jpg',
        thumbnail_path: null,
        pick_status: 'unreviewed',
        analysis_status: 'pending',
        is_deleted: false,
        created_at: '2026-02-03T10:00:00.000Z',
      },
    ])).toEqual([
      {
        id: 'photo-1',
        projectId: 'project-new',
        originalFilename: 'Laura 01.jpg',
        storagePath: 'organizations/org-1/projects/project-new/originals/photo-1-Laura-01.jpg',
        thumbnailPath: null,
        pickStatus: 'unreviewed',
        analysisStatus: 'pending',
        createdAt: '2026-02-03T10:00:00.000Z',
      },
    ]);
  });
});
