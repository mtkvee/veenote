import type { Toast } from "@/lib/useToasts";

type ToastViewportProps = {
  toasts: Toast[];
};

export function ToastViewport({ toasts }: ToastViewportProps) {
  const copyToasts = toasts.filter(
    (toast) =>
      toast.message === "Copy to clipboard." ||
      toast.message === "Copied to clipboard.",
  );
  if (copyToasts.length === 0) return null;

  return (
    <div className="toastViewport" aria-live="polite" aria-atomic="false">
      {copyToasts.map((toast) => (
        <div
          key={toast.id}
          className="toast toastInfo toastCopy"
          role="status"
        >
          Copy to clipboard.
        </div>
      ))}
    </div>
  );
}
