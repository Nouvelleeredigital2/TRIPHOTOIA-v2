import React, { useEffect, useRef } from 'react';

interface HistogramProps {
  imageUrl?: string;
  height?: number;
  buckets?: number;
}

const DEFAULT_HEIGHT = 160;
const DEFAULT_BUCKETS = 64;

export const Histogram: React.FC<HistogramProps> = ({ imageUrl, height = DEFAULT_HEIGHT, buckets = DEFAULT_BUCKETS }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const drawPlaceholder = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Histogramme indisponible', canvas.width / 2, canvas.height / 2);
    };

    if (!imageUrl) {
      drawPlaceholder();
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const offscreen = document.createElement('canvas');
        const maxDimension = 512;
        const scale = Math.min(maxDimension / image.width, maxDimension / image.height, 1);
        offscreen.width = Math.max(1, Math.floor(image.width * scale));
        offscreen.height = Math.max(1, Math.floor(image.height * scale));

        const offCtx = offscreen.getContext('2d');
        if (!offCtx) {
          drawPlaceholder();
          return;
        }

        offCtx.drawImage(image, 0, 0, offscreen.width, offscreen.height);
        const imageData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
        const histogram = new Array(buckets).fill(0);
        const bucketSize = 256 / buckets;

        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
          const bucketIndex = Math.min(buckets - 1, Math.floor(luminance / bucketSize));
          histogram[bucketIndex] += 1;
        }

        const maxValue = Math.max(...histogram, 1);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = canvas.width / buckets;
        histogram.forEach((value, index) => {
          const normalized = value / maxValue;
          const barHeight = normalized * (canvas.height - 10);
          const x = index * barWidth;
          const y = canvas.height - barHeight;

          const gradient = ctx.createLinearGradient(x, y, x, canvas.height);
          gradient.addColorStop(0, 'rgba(129, 140, 248, 0.8)');
          gradient.addColorStop(1, 'rgba(196, 181, 253, 0.2)');

          ctx.fillStyle = gradient;
          ctx.fillRect(x, y, barWidth * 0.9, barHeight);
        });

        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
      } catch (error) {
        console.error('Histogram render error', error);
        drawPlaceholder();
      }
    };
    image.onerror = drawPlaceholder;
    image.src = imageUrl;

    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [imageUrl, buckets]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">Histogramme</span>
        <span className="text-muted-foreground">Luminance</span>
      </div>
      <canvas
        ref={canvasRef}
        width={512}
        height={height}
        className="w-full rounded-md bg-background/60"
        aria-label="Histogramme de l'image"
      />
    </div>
  );
};
