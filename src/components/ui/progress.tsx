import React from 'react';

interface ProgressProps {
  value: number;
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({ value, className }) => {
  const clamped = Math.min(Math.max(value, 0), 100);

  return (
    <div className={`w-full overflow-hidden rounded-full bg-slate-800 ${className ?? ''}`} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full bg-cyan-500 transition-all duration-200" style={{ width: `${clamped}%` }} />
    </div>
  );
};
