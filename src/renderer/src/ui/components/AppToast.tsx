import type { JSX } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

export type ToastType = 'info' | 'error' | 'warning' | 'success';

export type Toast = {
  id: number;
  type: ToastType;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const toastIcons: Record<ToastType, typeof Info> = {
  info: Info,
  error: AlertCircle,
  warning: TriangleAlert,
  success: CheckCircle2,
};

type AppToastProps = {
  toast: Toast;
  onClose: () => void;
};

export const AppToast = ({ toast, onClose }: AppToastProps): JSX.Element => {
  const ToastIcon = toastIcons[toast.type];

  return (
    <div className={`app-toast ${toast.type}`}>
      <ToastIcon size={18} />
      <span>{toast.message}</span>
      {toast.actionLabel && toast.onAction && (
        <button className="app-toast-action" type="button" onClick={toast.onAction}>
          {toast.actionLabel}
        </button>
      )}
      <button type="button" title="Close notification" aria-label="Close notification" onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
};
