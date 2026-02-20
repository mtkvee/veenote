import { useCallback, useEffect, useRef, useState } from "react";

export type ToastKind = "success" | "info";

export type Toast = {
  id: string;
  message: string;
  kind: ToastKind;
};

const DEFAULT_TOAST_DURATION_MS = 1600;

export const useToasts = (defaultDurationMs = DEFAULT_TOAST_DURATION_MS) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutIdsRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timeoutId = timeoutIdsRef.current.get(id);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      timeoutIdsRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = "info", durationMs = defaultDurationMs) => {
      const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, message, kind }]);
      const timeoutId = window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        timeoutIdsRef.current.delete(id);
      }, durationMs);
      timeoutIdsRef.current.set(id, timeoutId);
      return id;
    },
    [defaultDurationMs],
  );

  useEffect(() => {
    const timeoutIds = timeoutIdsRef.current;
    return () => {
      timeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timeoutIds.clear();
    };
  }, []);

  return {
    toasts,
    showToast,
    dismissToast,
  };
};
