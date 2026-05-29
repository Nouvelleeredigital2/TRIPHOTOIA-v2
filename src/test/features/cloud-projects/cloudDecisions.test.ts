import { describe, expect, it, vi } from 'vitest';
import {
  buildCloudDecisionPatch,
  persistCloudAutoFlowDecision,
  persistCloudAutoFlowRating,
  updateCloudPhotoDecision,
  updateCloudPhotoRating,
} from '../../../features/cloud-projects/cloudDecisions';

describe('cloud AutoFlow decisions', () => {
  it('maps pick decisions to cloud photo columns', () => {
    expect(buildCloudDecisionPatch('pick')).toEqual({
      pick_status: 'pick',
      is_favorite: false,
      autoflow_class: 'keep',
    });
  });

  it('maps reject decisions to cloud photo columns', () => {
    expect(buildCloudDecisionPatch('reject')).toEqual({
      pick_status: 'reject',
      is_favorite: false,
      autoflow_class: 'reject',
    });
  });

  it('maps favorite decisions to a five-star cloud pick', () => {
    expect(buildCloudDecisionPatch('favorite')).toEqual({
      pick_status: 'pick',
      is_favorite: true,
      rating: 5,
      autoflow_class: 'keep',
    });
  });

  it('maps review decisions to the review pile', () => {
    expect(buildCloudDecisionPatch('review')).toEqual({
      pick_status: 'review',
      autoflow_class: 'review',
    });
  });

  it('updates one cloud photo decision through Supabase', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    const client = {
      from: vi.fn(() => ({ update })),
    };

    await updateCloudPhotoDecision({
      photoId: 'cloud-photo-1',
      decision: 'favorite',
      client,
    });

    expect(client.from).toHaveBeenCalledWith('photos');
    expect(update).toHaveBeenCalledWith({
      pick_status: 'pick',
      is_favorite: true,
      rating: 5,
      autoflow_class: 'keep',
    });
    expect(eq).toHaveBeenCalledWith('id', 'cloud-photo-1');
  });

  it('skips cloud persistence when no active cloud project is selected', async () => {
    const updateDecision = vi.fn();
    const onRollback = vi.fn();

    await persistCloudAutoFlowDecision({
      localPhotoId: 'local-photo-1',
      decision: 'pick',
      previous: { isPick: false },
      activeProject: null,
      getCloudPhotoId: () => 'cloud-photo-1',
      updateDecision,
      onRollback,
    });

    expect(updateDecision).not.toHaveBeenCalled();
    expect(onRollback).not.toHaveBeenCalled();
  });

  it('rolls back the local AutoFlow decision when Supabase rejects the update', async () => {
    const previous = { isPick: false, isRejected: false, rating: 2 };
    const updateDecision = vi.fn().mockRejectedValue(new Error('offline'));
    const onRollback = vi.fn();
    const onError = vi.fn();

    await persistCloudAutoFlowDecision({
      localPhotoId: 'local-photo-1',
      decision: 'favorite',
      previous,
      activeProject: { id: 'project-1' },
      getCloudPhotoId: () => 'cloud-photo-1',
      updateDecision,
      onRollback,
      onError,
    });

    expect(updateDecision).toHaveBeenCalledWith({
      photoId: 'cloud-photo-1',
      decision: 'favorite',
    });
    expect(onRollback).toHaveBeenCalledWith('local-photo-1', previous);
    expect(onError).toHaveBeenCalledWith('offline');
  });

  it('invalidates cloud project photos after a successful cloud decision', async () => {
    const updateDecision = vi.fn().mockResolvedValue(undefined);
    const onPersisted = vi.fn();

    await persistCloudAutoFlowDecision({
      localPhotoId: 'local-photo-1',
      decision: 'reject',
      previous: { isRejected: false },
      activeProject: { id: 'project-1' },
      getCloudPhotoId: () => 'cloud-photo-1',
      updateDecision,
      onRollback: vi.fn(),
      onPersisted,
    });

    expect(onPersisted).toHaveBeenCalledWith('project-1');
  });

  it('updates one cloud photo rating through Supabase', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn(() => ({ eq }));
    const client = {
      from: vi.fn(() => ({ update })),
    };

    await updateCloudPhotoRating({
      photoId: 'cloud-photo-1',
      rating: 4,
      client,
    });

    expect(client.from).toHaveBeenCalledWith('photos');
    expect(update).toHaveBeenCalledWith({ rating: 4 });
    expect(eq).toHaveBeenCalledWith('id', 'cloud-photo-1');
  });

  it('rolls back the local AutoFlow rating when Supabase rejects the update', async () => {
    const previous = { rating: 1 };
    const updateRating = vi.fn().mockRejectedValue(new Error('rating failed'));
    const onRollback = vi.fn();
    const onError = vi.fn();

    await persistCloudAutoFlowRating({
      localPhotoId: 'local-photo-1',
      rating: 5,
      previous,
      activeProject: { id: 'project-1' },
      getCloudPhotoId: () => 'cloud-photo-1',
      updateRating,
      onRollback,
      onError,
    });

    expect(updateRating).toHaveBeenCalledWith({
      photoId: 'cloud-photo-1',
      rating: 5,
    });
    expect(onRollback).toHaveBeenCalledWith('local-photo-1', previous);
    expect(onError).toHaveBeenCalledWith('rating failed');
  });
});
