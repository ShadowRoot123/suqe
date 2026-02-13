import React from "react";

export function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = React.useState<T>(value);

  React.useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}

