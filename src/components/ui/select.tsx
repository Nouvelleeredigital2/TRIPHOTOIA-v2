import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type SelectContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  value?: string;
  setValue: (value: string, label?: string) => void;
  selectedLabel?: string;
  placeholder?: string;
};

const SelectContext = createContext<SelectContextValue | null>(null);

export function Select({
  value,
  onValueChange,
  children,
  placeholder,
}: React.PropsWithChildren<{
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<string | undefined>(value);
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>(undefined);

  // Keep internal value in sync if controlled
  React.useEffect(() => {
    if (value !== undefined) setInternalValue(value);
  }, [value]);

  // useCallback : sinon setValue est recréé à chaque rendu et invalide le useMemo du contexte.
  const setValue = useCallback((newValue: string, label?: string) => {
    setInternalValue(newValue);
    if (label) setSelectedLabel(label);
    onValueChange?.(newValue);
    setOpen(false);
  }, [onValueChange]);

  const ctx = useMemo<SelectContextValue>(
    () => ({ open, setOpen, value: internalValue, setValue, selectedLabel, placeholder }),
    [open, internalValue, selectedLabel, placeholder, setValue]
  );

  return <SelectContext.Provider value={ctx}>{children}</SelectContext.Provider>;
}

export function SelectTrigger({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  const ctx = useContext(SelectContext);
  if (!ctx) return null;

  const label = ctx.selectedLabel ?? (ctx.value ?? ctx.placeholder ?? 'Sélectionner');

  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(!ctx.open)}
      className={
        'inline-flex items-center justify-between rounded-md border px-3 py-2 text-sm bg-background hover:bg-accent w-full ' +
        className
      }
    >
      <span className="truncate">
        {children ?? label}
      </span>
      <svg
        className="ml-2 h-4 w-4 opacity-70"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </button>
  );
}

export function SelectContent({
  children,
  className = '',
}: React.PropsWithChildren<{ className?: string }>) {
  const ctx = useContext(SelectContext);
  const menuRef = useRef<HTMLDivElement>(null);
  if (!ctx) return null;

  if (!ctx.open) return null;

  return (
    <div className="relative z-50">
      <div
        className={`absolute mt-2 w-56 rounded-md border bg-card shadow-lg p-1 max-h-64 overflow-auto ${className}`}
        ref={menuRef}
        role="listbox"
      >
        {children}
      </div>
    </div>
  );
}

export function SelectItem({ value, children }: React.PropsWithChildren<{ value: string }>) {
  const ctx = useContext(SelectContext);
  if (!ctx) return null;

  const handleClick = (e: React.MouseEvent) => {
    const label = (e.currentTarget as HTMLDivElement).innerText;
    ctx.setValue(value, label);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Créer un événement factice pour handleClick
      const fakeEvent = { currentTarget: e.currentTarget } as React.MouseEvent<HTMLDivElement>;
      handleClick(fakeEvent);
    }
  };

  const isSelected = ctx.value === value;

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={
        'cursor-pointer select-none rounded px-2 py-1 text-sm hover:bg-accent ' +
        (isSelected ? 'bg-accent' : '')
      }
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = useContext(SelectContext);
  if (!ctx) return null;
  const label = ctx.selectedLabel ?? (ctx.value ?? placeholder ?? ctx.placeholder ?? 'Sélectionner');
  return <span>{label}</span>;
}
