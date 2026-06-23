import { act, fireEvent, render, screen, waitFor } from '../../test-utils';
import { describe, expect, it, vi } from 'vitest';
import { AutoFlowMode } from '../../../components/autoflow/AutoFlowMode';
import { AfPhoto } from '../../../components/autoflow/afUtils';

const makePhoto = (overrides: Partial<AfPhoto>): AfPhoto => ({
  id: 'photo-1',
  name: 'DSC_0001.JPG',
  gradient: ['#111827', '#1f2937'],
  score: 70,
  cls: 'review',
  isDup: false,
  isBlurry: false,
  isPick: false,
  isRejected: false,
  isFavorite: false,
  rating: 0,
  sharp: 70,
  expo: 70,
  comp: 70,
  ...overrides,
});

describe('AutoFlowMode', () => {
  it('starts swipe from the provided filtered photo ids only', async () => {
    const onMutation = vi.fn();

    vi.useFakeTimers();
    try {
      render(
        <AutoFlowMode
          photos={[
            makePhoto({ id: 'visible-1', cls: 'review', name: 'VISIBLE.JPG' }),
            makePhoto({ id: 'hidden-1', cls: 'review', name: 'HIDDEN.JPG' }),
          ]}
          initialPhotoIds={['visible-1']}
          onMutation={onMutation}
          onClose={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /mode swipe/i }));
      expect(screen.getByText('VISIBLE.JPG')).toBeInTheDocument();
      expect(screen.queryByText('HIDDEN.JPG')).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(onMutation).toHaveBeenCalledWith(
        'visible-1',
        expect.objectContaining({ isPick: true })
      );
      expect(screen.queryByText('HIDDEN.JPG')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('swipes review, keep, then reject photos in AutoFlow order', async () => {
    const onMutation = vi.fn();

    vi.useFakeTimers();
    try {
      render(
        <AutoFlowMode
          photos={[
            makePhoto({
              id: 'keep-1',
              cls: 'keep',
              name: 'KEEP.JPG',
              score: 92,
            }),
            makePhoto({
              id: 'reject-1',
              cls: 'reject',
              name: 'REJECT.JPG',
              score: 35,
            }),
            makePhoto({
              id: 'review-1',
              cls: 'review',
              name: 'REVIEW.JPG',
              score: 64,
            }),
          ]}
          onMutation={onMutation}
          onClose={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /mode swipe/i }));
      expect(screen.getByText('REVIEW.JPG')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(onMutation).toHaveBeenCalledWith(
        'review-1',
        expect.objectContaining({ isPick: true })
      );
      expect(screen.getByText('KEEP.JPG')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(onMutation).toHaveBeenCalledWith(
        'keep-1',
        expect.objectContaining({ isRejected: true })
      );
      expect(screen.getByText('REJECT.JPG')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks ArrowUp decisions as favorites with five stars', async () => {
    const onMutation = vi.fn();
    const onDecision = vi.fn();

    vi.useFakeTimers();
    try {
      render(
        <AutoFlowMode
          photos={[makePhoto({ id: 'review-1', cls: 'review' })]}
          onMutation={onMutation}
          onDecision={onDecision}
          onClose={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /mode swipe/i }));
      fireEvent.keyDown(window, { key: 'ArrowUp' });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(onMutation).toHaveBeenCalledWith(
        'review-1',
        expect.objectContaining({
          isPick: true,
          isFavorite: true,
          rating: 5,
          cls: 'keep',
        })
      );
      expect(onDecision).toHaveBeenCalledWith(
        'review-1',
        'favorite',
        expect.objectContaining({
          isPick: false,
          isRejected: false,
          isFavorite: false,
          rating: 0,
          cls: 'review',
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies manual numeric ratings without leaving the current photo', async () => {
    const onMutation = vi.fn();
    const onRating = vi.fn();

    render(
      <AutoFlowMode
        photos={[makePhoto({ id: 'review-1', cls: 'review', rating: 1 })]}
        onMutation={onMutation}
        onRating={onRating}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /mode swipe/i }));
    fireEvent.keyDown(window, { key: '3' });

    await waitFor(() =>
      expect(onMutation).toHaveBeenCalledWith(
        'review-1',
        expect.objectContaining({ rating: 3 })
      )
    );
    expect(onRating).toHaveBeenCalledWith(
      'review-1',
      3,
      expect.objectContaining({
        isPick: false,
        isRejected: false,
        isFavorite: false,
        rating: 1,
        cls: 'review',
      })
    );
    expect(screen.getByText('DSC_0001.JPG')).toBeInTheDocument();
  });

  it('rates the current photo when a star is clicked (without leaving it)', async () => {
    const onMutation = vi.fn();
    const onRating = vi.fn();

    render(
      <AutoFlowMode
        photos={[makePhoto({ id: 'review-1', cls: 'review', rating: 1 })]}
        onMutation={onMutation}
        onRating={onRating}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /mode swipe/i }));
    // Clicking the 4th star sets rating=4 — the stars must be interactive.
    fireEvent.click(screen.getByRole('button', { name: /noter 4 étoiles/i }));

    await waitFor(() =>
      expect(onMutation).toHaveBeenCalledWith(
        'review-1',
        expect.objectContaining({ rating: 4 })
      )
    );
    expect(onRating).toHaveBeenCalledWith('review-1', 4, expect.anything());
    // Rating must not advance the queue.
    expect(screen.getByText('DSC_0001.JPG')).toBeInTheDocument();
  });

  it('undoes the last swipe decision, returns to that photo, and emits the restored decision', async () => {
    const onMutation = vi.fn();
    const onDecision = vi.fn();

    vi.useFakeTimers();
    try {
      render(
        <AutoFlowMode
          photos={[
            makePhoto({
              id: 'review-1',
              cls: 'review',
              name: 'REVIEW.JPG',
              rating: 2,
            }),
            makePhoto({
              id: 'keep-1',
              cls: 'keep',
              name: 'KEEP.JPG',
              score: 92,
            }),
          ]}
          onMutation={onMutation}
          onDecision={onDecision}
          onClose={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /mode swipe/i }));
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(screen.getByText('KEEP.JPG')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'Backspace' });

      expect(onMutation).toHaveBeenLastCalledWith(
        'review-1',
        expect.objectContaining({
          isPick: false,
          isRejected: false,
          isFavorite: false,
          rating: 2,
          cls: 'review',
        })
      );
      expect(onDecision).toHaveBeenLastCalledWith(
        'review-1',
        'review',
        expect.objectContaining({
          isPick: true,
          isRejected: false,
          isFavorite: false,
          rating: 2,
          cls: 'keep',
        })
      );
      expect(screen.getByText('REVIEW.JPG')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rates a photo from the gallery detail panel when a star is clicked', () => {
    const onMutation = vi.fn();

    render(
      <AutoFlowMode
        photos={[
          makePhoto({
            id: 'picked-1',
            cls: 'keep',
            name: 'PICKED.JPG',
            isPick: true,
          }),
        ]}
        onMutation={onMutation}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /voir les picks/i }));
    fireEvent.click(screen.getByRole('button', { name: /picked\.jpg/i }));
    // The gallery detail-panel stars must be interactive (regression).
    fireEvent.click(screen.getByRole('button', { name: /noter 3 étoiles/i }));

    expect(onMutation).toHaveBeenCalledWith(
      'picked-1',
      expect.objectContaining({ rating: 3 })
    );
  });

  it('emits a review decision when a gallery pick is toggled off', () => {
    const onMutation = vi.fn();
    const onDecision = vi.fn();

    render(
      <AutoFlowMode
        photos={[
          makePhoto({
            id: 'picked-1',
            cls: 'keep',
            name: 'PICKED.JPG',
            isPick: true,
          }),
        ]}
        onMutation={onMutation}
        onDecision={onDecision}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /voir les picks/i }));
    fireEvent.click(screen.getByRole('button', { name: /picked\.jpg/i }));
    fireEvent.click(screen.getByText(/pick$/i));

    expect(onMutation).toHaveBeenCalledWith(
      'picked-1',
      expect.objectContaining({ isPick: false, isRejected: false })
    );
    expect(onDecision).toHaveBeenCalledWith(
      'picked-1',
      'review',
      expect.objectContaining({
        isPick: true,
        isRejected: false,
        isFavorite: false,
        cls: 'keep',
      })
    );
  });

  it('emits cloud decisions for duplicate A/B compare winners and losers', () => {
    const onMutation = vi.fn();
    const onDecision = vi.fn();

    render(
      <AutoFlowMode
        photos={[
          makePhoto({
            id: 'left',
            name: 'LEFT.JPG',
            isDup: true,
            dupGroup: 'dup-1',
            isRejected: true,
            score: 80,
          }),
          makePhoto({
            id: 'right',
            name: 'RIGHT.JPG',
            isDup: true,
            dupGroup: 'dup-1',
            isPick: true,
            isFavorite: true,
            score: 90,
          }),
        ]}
        onMutation={onMutation}
        onDecision={onDecision}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Doublons détectés'));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    expect(onDecision).toHaveBeenCalledWith(
      'left',
      'pick',
      expect.objectContaining({
        isPick: false,
        isRejected: true,
        isFavorite: false,
        cls: 'review',
      })
    );
    expect(onDecision).toHaveBeenCalledWith(
      'right',
      'reject',
      expect.objectContaining({
        isPick: true,
        isRejected: false,
        isFavorite: true,
        cls: 'review',
      })
    );
  });
});
