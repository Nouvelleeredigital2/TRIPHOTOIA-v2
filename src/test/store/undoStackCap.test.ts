import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { usePhotoStore, UNDO_STACK_LIMIT } from '@/store/photoStore';
import type { Photo, UndoAction } from '@/types';

// P1-F : l'historique d'undo est plafonné et libère les ressources évincées.

function makeDeleteAction(i: number): UndoAction {
  const photo: Photo = {
    id: `p${i}`,
    file: new File([new Uint8Array([1])], `p${i}.jpg`, { type: 'image/jpeg' }),
    previewUrl: `blob:mock/${i}`,
    analysis: null,
  };
  return {
    type: 'DELETE_PHOTO',
    payload: {
      photo,
      index: i,
      collectionIds: [],
      wasRejected: false,
      bestOverrides: {},
    },
  };
}

const g = globalThis as unknown as { URL: typeof URL };
let originalRevoke: typeof URL.revokeObjectURL;
let revoked: string[];

beforeEach(() => {
  usePhotoStore.getState().clearAll();
  usePhotoStore.setState({ undoStack: [] });
  revoked = [];
  originalRevoke = g.URL.revokeObjectURL;
  g.URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
});

afterEach(() => {
  g.URL.revokeObjectURL = originalRevoke;
});

describe('undoStack plafonné (P1-F)', () => {
  it('ne dépasse jamais UNDO_STACK_LIMIT et révoque les URL blob évincées', () => {
    const { addUndoAction } = usePhotoStore.getState();
    // On empile une action de plus que le plafond.
    for (let i = 0; i <= UNDO_STACK_LIMIT; i++) {
      addUndoAction(makeDeleteAction(i));
    }

    const stack = usePhotoStore.getState().undoStack;
    expect(stack.length).toBe(UNDO_STACK_LIMIT);
    // La plus ancienne (p0) a été évincée → son URL blob est révoquée.
    expect(revoked).toContain('blob:mock/0');
    // La plus ancienne encore présente est p1.
    expect(
      (stack[0] as Extract<UndoAction, { type: 'DELETE_PHOTO' }>).payload.photo
        .id
    ).toBe('p1');
  });
});
