import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StarRatingProps {
  rating: number; // 0-5
  onRatingChange?: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
  showCount?: boolean;
  className?: string;
}

export function StarRating({
  rating = 0,
  onRatingChange,
  size = 'md',
  readonly = false,
  showCount = false,
  className,
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);

  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const handleClick = (value: number) => {
    if (readonly || !onRatingChange) return;

    // Si on clique sur la même étoile, on retire la note
    if (value === rating) {
      onRatingChange(0);
    } else {
      onRatingChange(value);
    }
  };

  const handleMouseEnter = (value: number) => {
    if (!readonly) {
      setHoverRating(value);
    }
  };

  const handleMouseLeave = () => {
    setHoverRating(0);
  };

  const displayRating = hoverRating || rating;

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      {[1, 2, 3, 4, 5].map((value) => {
        const isFilled = value <= displayRating;
        const isHovered = value <= hoverRating;

        return (
          <button
            key={value}
            type="button"
            onClick={() => handleClick(value)}
            onMouseEnter={() => handleMouseEnter(value)}
            onMouseLeave={handleMouseLeave}
            disabled={readonly}
            className={cn(
              'transition-all duration-150',
              !readonly && 'cursor-pointer hover:scale-110',
              readonly && 'cursor-default'
            )}
            aria-label={`${value} étoile${value > 1 ? 's' : ''}`}
          >
            <Star
              className={cn(
                sizeClasses[size],
                'transition-colors duration-150',
                isFilled && !isHovered && 'fill-yellow-400 text-yellow-400',
                isFilled && isHovered && 'fill-yellow-500 text-yellow-500',
                !isFilled &&
                  !isHovered &&
                  'fill-transparent text-muted-foreground',
                !isFilled && isHovered && 'fill-yellow-200 text-yellow-300'
              )}
            />
          </button>
        );
      })}

      {showCount && rating > 0 && (
        <span className="ml-1 text-xs font-medium text-muted-foreground">
          ({rating})
        </span>
      )}
    </div>
  );
}
