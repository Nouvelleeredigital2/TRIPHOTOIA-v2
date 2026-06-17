import * as React from 'react';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={
          'w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ' +
          'border-slate-300 placeholder:text-slate-400' +
          'focus:border-primary focus:ring-2 focus:ring-primary/50' +
          'disabled:cursor-not-allowed disabled:opacity-60' +
          className
        }
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
