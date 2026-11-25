'use client';

import * as React from 'react';
import { Input } from '@/components/ui/form-controls';
import { cn } from '@/lib/utils';

/**
 * Text box with a suggestion list underneath: shows matching entries while typing
 * (all of them when empty and focused). Anything typed is kept as-is when nothing
 * is picked. Keyboard: ↑ ↓ to move, Enter to pick, Esc to close.
 */
export function SuggestInput({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  maxLength,
  emptyHint,
  selectAllOnFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  maxLength?: number;
  emptyHint?: string;
  /** Select the current text on focus, so typing replaces it (e.g. the default "Self"). */
  selectAllOnFocus?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  // Compare without dots, commas or extra spaces: "dr a" finds "Dr. Amir".
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const q = norm(value);
  const matches = React.useMemo(() => {
    const all = [...new Set(suggestions)].filter((s) => !q || norm(s).includes(q));
    // Names starting with the typed text first.
    return [...all.filter((s) => norm(s).startsWith(q)), ...all.filter((s) => !norm(s).startsWith(q))].slice(0, 8);
  }, [suggestions, q]);
  const exact = matches.length === 1 && norm(matches[0]) === q;
  const show = open && matches.length > 0 && !exact;

  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-controls={`${id}-list`}
        onFocus={(e) => {
          setOpen(true);
          if (selectAllOnFocus) e.currentTarget.select();
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % matches.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(matches[active] ?? matches[0]); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {show && (
        <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-xl border bg-popover p-1 text-sm shadow-elevated">
          {matches.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={i === active}
              className={cn('cursor-pointer rounded-lg px-3 py-2', i === active ? 'bg-primary/10 text-primary' : 'hover:bg-muted')}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              onMouseEnter={() => setActive(i)}
            >
              {s}
            </li>
          ))}
          {emptyHint && q && !matches.some((s) => norm(s) === q) && <li className="px-3 py-1.5 text-xs text-muted-foreground">{emptyHint}</li>}
        </ul>
      )}
    </div>
  );
}
