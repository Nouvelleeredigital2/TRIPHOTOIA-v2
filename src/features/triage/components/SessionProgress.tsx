import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Photo } from '../../../types';

interface SessionProgressProps {
  photos: Photo[];
}

export function SessionProgress({ photos }: SessionProgressProps) {
  const stats = useMemo(() => {
    const analyzed = photos.filter((p) => p.analysis && !p.analysis.error);
    if (analyzed.length === 0) return null;

    const picks = analyzed.filter((p) => p.analysis?.isPick).length;
    const rejected = analyzed.filter((p) => p.analysis?.isRejected).length;
    const rated = analyzed.filter((p) => (p.analysis?.rating ?? 0) > 0).length;

    // Actionnée = a au moins un flag, une note, ou un pick/reject
    const actionedIds = new Set<string>();
    analyzed.forEach((p) => {
      if (
        p.analysis?.isPick ||
        p.analysis?.isRejected ||
        (p.analysis?.rating ?? 0) > 0 ||
        p.analysis?.colorLabel
      ) {
        actionedIds.add(p.id);
      }
    });

    const actioned = actionedIds.size;
    const pending = analyzed.length - actioned;
    const pct = Math.round((actioned / analyzed.length) * 100);

    return {
      total: analyzed.length,
      picks,
      rejected,
      rated,
      actioned,
      pending,
      pct,
    };
  }, [photos]);

  if (!stats || stats.total === 0) return null;

  return (
    <div className="space-y-1.5 px-1">
      {/* Ligne de stats */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">
          <span className="font-semibold text-foreground">
            {stats.actioned}
          </span>
          {' / '}
          {stats.total} triées{' '}
          <span className="text-muted-foreground">({stats.pct}%)</span>
        </span>

        <div className="flex items-center gap-3 text-muted-foreground">
          {stats.picks > 0 && (
            <span title="Picks">
              🎯{' '}
              <span className="font-semibold text-foreground">
                {stats.picks}
              </span>
            </span>
          )}
          {stats.rejected > 0 && (
            <span title="Rejetées">
              ❌{' '}
              <span className="font-semibold text-foreground">
                {stats.rejected}
              </span>
            </span>
          )}
          {stats.rated > 0 && (
            <span title="Notées">
              ⭐{' '}
              <span className="font-semibold text-foreground">
                {stats.rated}
              </span>
            </span>
          )}
          {stats.pending > 0 && (
            <span title="Sans action" className="opacity-60">
              ⬜ {stats.pending}
            </span>
          )}
        </div>
      </div>

      {/* Barre de progression */}
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary"
          initial={{ width: 0 }}
          animate={{ width: `${stats.pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
