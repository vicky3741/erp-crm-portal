import { useEffect, useState } from 'react';

/**
 * Delays a rapidly-changing value.
 *
 * Used for the search boxes: without it every keystroke fires a request, and
 * responses can arrive out of order so the list flickers between results.
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
