import { fireEvent, render, screen } from '../../test-utils';
import { describe, expect, it, vi } from 'vitest';

import { AutoFlowDupCompare } from '../../../components/autoflow/AutoFlowDupCompare';
import { AfPhoto } from '../../../components/autoflow/afUtils';

const makePhoto = (overrides: Partial<AfPhoto>): AfPhoto => ({
  id: 'photo-1',
  name: 'DSC_0001.JPG',
  gradient: ['#111827', '#1f2937'],
  score: 70,
  cls: 'review',
  isDup: true,
  dupGroup: 'dup-1',
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

describe('AutoFlowDupCompare', () => {
  it('keeps the left photo and rejects the right photo with one ArrowLeft decision', () => {
    const onDecision = vi.fn();
    const onBack = vi.fn();

    render(
      <AutoFlowDupCompare
        photos={[
          makePhoto({ id: 'left', name: 'LEFT.JPG', isRejected: true, score: 80 }),
          makePhoto({ id: 'right', name: 'RIGHT.JPG', isPick: true, isFavorite: true, score: 90 }),
        ]}
        onDecision={onDecision}
        onBack={onBack}
      />,
    );

    expect(screen.getByText('LEFT.JPG')).toBeInTheDocument();
    expect(screen.getByText('RIGHT.JPG')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });

    expect(onDecision).toHaveBeenCalledWith(
      'left',
      expect.objectContaining({
        isPick: true,
        isRejected: false,
        isFavorite: false,
        cls: 'keep',
      }),
    );
    expect(onDecision).toHaveBeenCalledWith(
      'right',
      expect.objectContaining({
        isPick: false,
        isRejected: true,
        isFavorite: false,
        cls: 'reject',
      }),
    );
    expect(onBack).toHaveBeenCalled();
  });

  it('keeps the right photo and rejects the left photo with one ArrowRight decision', () => {
    const onDecision = vi.fn();
    const onBack = vi.fn();

    render(
      <AutoFlowDupCompare
        photos={[
          makePhoto({ id: 'left', name: 'LEFT.JPG', score: 80 }),
          makePhoto({ id: 'right', name: 'RIGHT.JPG', score: 90 }),
        ]}
        onDecision={onDecision}
        onBack={onBack}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(onDecision).toHaveBeenCalledWith(
      'right',
      expect.objectContaining({ isPick: true, isRejected: false, cls: 'keep' }),
    );
    expect(onDecision).toHaveBeenCalledWith(
      'left',
      expect.objectContaining({ isPick: false, isRejected: true, cls: 'reject' }),
    );
    expect(onBack).toHaveBeenCalled();
  });

  it('skips duplicate groups with Enter and returns with Escape', () => {
    const onDecision = vi.fn();
    const onBack = vi.fn();

    render(
      <AutoFlowDupCompare
        photos={[
          makePhoto({ id: 'left', name: 'LEFT.JPG' }),
          makePhoto({ id: 'right', name: 'RIGHT.JPG' }),
        ]}
        onDecision={onDecision}
        onBack={onBack}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onDecision).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
