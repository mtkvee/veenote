import type { Toast } from "@/lib/useToasts";

type ToastViewportProps = {
  toasts: Toast[];
};

export function ToastViewport({ toasts }: ToastViewportProps) {
  return (
    <div className="toastViewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast${toast.kind === "success" ? "Success" : "Info"}`}
          role="status"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
