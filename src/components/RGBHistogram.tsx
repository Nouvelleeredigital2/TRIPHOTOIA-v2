/**
 * RGBHistogram — histogramme RVB calculé côté client via Canvas API.
 * Usage : <RGBHistogram src={photo.previewUrl} />
 * - Charge l'image dans un canvas offscreen (redimensionné à 200px max)
 * - Calcule 64 bins par canal R/G/B
 * - Affiche les barres en overlay screen-blending
 */
import React, { useEffect, useState } from 'react';

interface HistData {
  r: number[];
  g: number[];
  b: number[];
}

const BINS = 64;

function computeHistogram(src: string): Promise<HistData | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 200 / Math.max(img.width, img.height, 1));
        canvas.width = Math.max(1, Math.floor(img.width * scale));
        canvas.height = Math.max(1, Math.floor(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        const r = new Array<number>(BINS).fill(0);
        const g = new Array<number>(BINS).fill(0);
        const b = new Array<number>(BINS).fill(0);
        const binSize = 256 / BINS;

        for (let i = 0; i < data.length; i += 4) {
          r[Math.min(BINS - 1, Math.floor(data[i] / binSize))]++;
          g[Math.min(BINS - 1, Math.floor(data[i + 1] / binSize))]++;
          b[Math.min(BINS - 1, Math.floor(data[i + 2] / binSize))]++;
        }

        resolve({ r, g, b });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

interface RGBHistogramProps {
  src: string;
  /** Height in px (default 64) */
  height?: number;
  className?: string;
  /** Show R/G/B legend below (default false) */
  showLegend?: boolean;
}

export function RGBHistogram({
  src,
  height = 64,
  className = '',
  showLegend = false,
}: RGBHistogramProps) {
  const [histData, setHistData] = useState<HistData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setHistData(null);

    let cancelled = false;
    computeHistogram(src).then((data) => {
      if (!cancelled) {
        setHistData(data);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (loading) {
    return (
      <div
        className={`flex animate-pulse items-center justify-center rounded bg-black/80 ${className}`}
        style={{ height }}
      >
        <span className="text-xs text-white/30">Calcul…</span>
      </div>
    );
  }

  if (!histData) return null;

  const maxVal = Math.max(...histData.r, ...histData.g, ...histData.b, 1);

  return (
    <div className={className}>
      <div
        className="relative overflow-hidden rounded bg-black"
        style={{ height }}
      >
        {(['r', 'g', 'b'] as const).map((ch) => {
          const colors = {
            r: 'rgba(239,68,68,0.65)',
            g: 'rgba(34,197,94,0.65)',
            b: 'rgba(59,130,246,0.65)',
          };
          return histData[ch].map((v, i) => (
            <div
              key={`${ch}-${i}`}
              className="absolute bottom-0"
              style={{
                left: `${(i / BINS) * 100}%`,
                width: `${100 / BINS}%`,
                height: `${(v / maxVal) * 100}%`,
                backgroundColor: colors[ch],
                mixBlendMode: 'screen',
              }}
            />
          ));
        })}
      </div>

      {showLegend && (
        <div className="flex justify-center gap-3 pt-1">
          {[
            ['R', '#ef4444'],
            ['V', '#22c55e'],
            ['B', '#3b82f6'],
          ].map(([ch, color]) => (
            <span key={ch} className="flex items-center gap-1 text-xs">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ backgroundColor: color }}
              />
              {ch}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
