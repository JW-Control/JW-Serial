import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Returns a stable function that always calls the latest `handler`. Lets
 * memoized children receive callbacks without re-rendering when the parent's
 * state changes.
 */
export const useEvent = (handler) => {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });
  return useCallback((...args) => handlerRef.current(...args), []);
};
