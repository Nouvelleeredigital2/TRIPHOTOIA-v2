import React from 'react';
import { afColor, afOverlay, afResetButton } from './afStyles';

interface AfStarsProps {
  rating: number;
  size?: number;
  /** When provided, stars become interactive: clicking star N calls onRate(N). */
  onRate?: (n: number) => void;
}

/**
 * Shared AutoFlow star rating (★ glyph, AutoFlow dark-chrome tokens).
 * Decorative when `onRate` is omitted; clickable buttons when provided.
 * Single source of truth for SwipeMode + Gallery (previously duplicated inline).
 */
export const AfStars: React.FC<AfStarsProps> = ({ rating, size = 18, onRate }) => (
  <div style={{ display: 'flex', gap: 2 }}>
    {[1, 2, 3, 4, 5].map((n) => {
      const color = n <= rating ? afColor.review : afOverlay(0.12);
      const base: React.CSSProperties = {
        fontSize: size,
        lineHeight: 1,
        userSelect: 'none',
        color,
      };
      if (!onRate) {
        return (
          <span key={n} style={base}>
            ★
          </span>
        );
      }
      return (
        <button
          key={n}
          type="button"
          aria-label={`Noter ${n} étoile${n > 1 ? 's' : ''}`}
          // Empêche le clic/drag de la carte (swipe) de se déclencher.
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRate(n);
          }}
          style={{ ...base, ...afResetButton }}
        >
          ★
        </button>
      );
    })}
  </div>
);
