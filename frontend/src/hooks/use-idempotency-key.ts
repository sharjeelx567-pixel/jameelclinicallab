import * as React from 'react';

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * One key per form submission. If the user retries after a timeout or
 * double-clicks, the same key is sent and the server returns the original
 * result instead of saving a second order/payment. Call `reset()` after a
 * confirmed success so the next submission is treated as new.
 */
export function useIdempotencyKey() {
  const ref = React.useRef<string>(newKey());
  return { key: () => ref.current, reset: () => void (ref.current = newKey()) };
}
