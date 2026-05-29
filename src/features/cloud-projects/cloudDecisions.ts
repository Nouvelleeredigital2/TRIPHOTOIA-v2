import { supabase } from '../../lib/supabase';

export type CloudAutoFlowDecision = 'pick' | 'reject' | 'favorite' | 'review';

export interface CloudDecisionPatch {
  pick_status: 'pick' | 'reject' | 'review';
  autoflow_class: 'keep' | 'reject' | 'review';
  is_favorite?: boolean;
  rating?: number;
}

interface CloudDecisionClient {
  from: (table: string) => {
    update: (payload: CloudDecisionPatch | { rating: number }) => {
      eq: (column: string, value: string) => PromiseLike<{ error: unknown }>;
    };
  };
}

interface UpdateCloudPhotoDecisionParams {
  photoId: string;
  decision: CloudAutoFlowDecision;
  client?: CloudDecisionClient | null;
}

interface UpdateCloudPhotoRatingParams {
  photoId: string;
  rating: number;
  client?: CloudDecisionClient | null;
}

interface CloudDecisionProjectRef {
  id: string;
}

interface PersistCloudAutoFlowDecisionParams<TPrevious> {
  localPhotoId: string;
  decision: CloudAutoFlowDecision;
  previous: TPrevious;
  activeProject: CloudDecisionProjectRef | null;
  getCloudPhotoId: (localPhotoId: string) => string | undefined;
  updateDecision?: (params: {
    photoId: string;
    decision: CloudAutoFlowDecision;
  }) => Promise<void>;
  onPersisted?: (projectId: string) => void | PromiseLike<void>;
  onRollback: (localPhotoId: string, previous: TPrevious) => void;
  onError?: (message: string) => void;
}

interface PersistCloudAutoFlowRatingParams<TPrevious> {
  localPhotoId: string;
  rating: number;
  previous: TPrevious;
  activeProject: CloudDecisionProjectRef | null;
  getCloudPhotoId: (localPhotoId: string) => string | undefined;
  updateRating?: (params: {
    photoId: string;
    rating: number;
  }) => Promise<void>;
  onPersisted?: (projectId: string) => void | PromiseLike<void>;
  onRollback: (localPhotoId: string, previous: TPrevious) => void;
  onError?: (message: string) => void;
}

export function buildCloudDecisionPatch(decision: CloudAutoFlowDecision): CloudDecisionPatch {
  if (decision === 'reject') {
    return {
      pick_status: 'reject',
      is_favorite: false,
      autoflow_class: 'reject',
    };
  }

  if (decision === 'review') {
    return {
      pick_status: 'review',
      autoflow_class: 'review',
    };
  }

  if (decision === 'favorite') {
    return {
      pick_status: 'pick',
      is_favorite: true,
      rating: 5,
      autoflow_class: 'keep',
    };
  }

  return {
    pick_status: 'pick',
    is_favorite: false,
    autoflow_class: 'keep',
  };
}

export async function updateCloudPhotoDecision({
  photoId,
  decision,
  client = supabase,
}: UpdateCloudPhotoDecisionParams): Promise<void> {
  if (!client) {
    throw new Error('Supabase non configurÃ©');
  }

  const { error } = await client
    .from('photos')
    .update(buildCloudDecisionPatch(decision))
    .eq('id', photoId);

  if (error) throw error;
}

export async function updateCloudPhotoRating({
  photoId,
  rating,
  client = supabase,
}: UpdateCloudPhotoRatingParams): Promise<void> {
  if (!client) {
    throw new Error('Supabase non configurÃ©');
  }

  const { error } = await client
    .from('photos')
    .update({ rating })
    .eq('id', photoId);

  if (error) throw error;
}

export async function persistCloudAutoFlowDecision<TPrevious>({
  localPhotoId,
  decision,
  previous,
  activeProject,
  getCloudPhotoId,
  updateDecision = updateCloudPhotoDecision,
  onPersisted,
  onRollback,
  onError,
}: PersistCloudAutoFlowDecisionParams<TPrevious>): Promise<void> {
  if (!activeProject) {
    return;
  }

  const cloudPhotoId = getCloudPhotoId(localPhotoId);
  if (!cloudPhotoId) {
    return;
  }

  try {
    await updateDecision({ photoId: cloudPhotoId, decision });
    await onPersisted?.(activeProject.id);
  } catch (error) {
    onRollback(localPhotoId, previous);
    onError?.(error instanceof Error ? error.message : 'Décision cloud non sauvegardée');
  }
}

export async function persistCloudAutoFlowRating<TPrevious>({
  localPhotoId,
  rating,
  previous,
  activeProject,
  getCloudPhotoId,
  updateRating = updateCloudPhotoRating,
  onPersisted,
  onRollback,
  onError,
}: PersistCloudAutoFlowRatingParams<TPrevious>): Promise<void> {
  if (!activeProject) {
    return;
  }

  const cloudPhotoId = getCloudPhotoId(localPhotoId);
  if (!cloudPhotoId) {
    return;
  }

  try {
    await updateRating({ photoId: cloudPhotoId, rating });
    await onPersisted?.(activeProject.id);
  } catch (error) {
    onRollback(localPhotoId, previous);
    onError?.(error instanceof Error ? error.message : 'Note cloud non sauvegardée');
  }
}
