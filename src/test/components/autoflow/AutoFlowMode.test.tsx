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
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /mode swipe/i }));
      expect(screen.getByText('VISIBLE.JPG')).toBeInTheDocument();
      expect(screen.queryByText('HIDDEN.JPG')).not.toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(onMutation).toHaveBeenCalledWith('visible-1', expect.objectContaining({ isPick: true }));
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
            makePhoto({ id: 'keep-1', cls: 'keep', name: 'KEEP.JPG', score: 92 }),
            makePhoto({ id: 'reject-1', cls: 'reject', name: 'REJECT.JPG', score: 35 }),
            makePhoto({ id: 'review-1', cls: 'review', name: 'REVIEW.JPG', score: 64 }),
          ]}
          onMutation={onMutation}
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /mode swipe/i }));
      expect(screen.getByText('REVIEW.JPG')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(onMutation).toHaveBeenCalledWith('review-1', expect.objectContaining({ isPick: true }));
      expect(screen.getByText('KEEP.JPG')).toBeInTheDocument();

      fireEvent.keyDown(window, { key: 'ArrowLeft' });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(onMutation).toHaveBeenCalledWith('keep-1', expect.objectContaining({ isRejected: true }));
      expect(screen.getByText('REJECT.JPG')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks ArrowUp decisions as favorites with five stars', async () => {
    const onMutation = vi.fn();

    vi.useFakeTimers();
    try {
      render(
        <AutoFlowMode
          photos={[makePhoto({ id: 'review-1', cls: 'review' })]}
          onMutation={onMutation}
          onClose={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /mode swipe/i }));
      fireEvent.keyDown(window, { key: 'ArrowUp' });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      expect(onMutation).toHaveBeenCalledWith(
        'review-1',
        expect.objectContaining({ isPick: true, isFavorite: true, rating: 5, cls: 'keep' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies manual numeric ratings without leaving the current photo', async () => {
    const onMutation = vi.fn();

    render(
      <AutoFlowMode
        photos={[makePhoto({ id: 'review-1', cls: 'review' })]}
        onMutation={onMutation}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /mode swipe/i }));
    fireEvent.keyDown(window, { key: '3' });

    await waitFor(() =>
      expect(onMutation).toHaveBeenCalledWith('review-1', expect.objectContaining({ rating: 3 })),
    );
    expect(screen.getByText('DSC_0001.JPG')).toBeInTheDocument();
  });

  it('undoes the last swipe decision and returns to that photo', async () => {
    const onMutation = vi.fn();

    vi.useFakeTimers();
    try {
      render(
        <AutoFlowMode
          photos={[
            makePhoto({ id: 'review-1', cls: 'review', name: 'REVIEW.JPG', rating: 2 }),
            makePhoto({ id: 'keep-1', cls: 'keep', name: 'KEEP.JPG', score: 92 }),
          ]}
          onMutation={onMutation}
          onClose={vi.fn()}
        />,
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
        }),
      );
      expect(screen.getByText('REVIEW.JPG')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
