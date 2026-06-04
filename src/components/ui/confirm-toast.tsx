import type { ReactNode } from 'react';
import { toast } from 'sonner';

type ToastMessage<Result> = ReactNode | ((result: Result) => ReactNode);
type ErrorToastMessage = ReactNode | ((error: unknown) => ReactNode);

type ConfirmActionToastOptions<Result> = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  loading: ReactNode;
  success: ToastMessage<Result>;
  error?: ErrorToastMessage;
  onConfirm: () => Promise<Result> | Result;
  onCancel?: () => void;
};

const resolveMessage = <Result,>(message: ToastMessage<Result>, result: Result) => (
  typeof message === 'function' ? message(result) : message
);

const resolveErrorMessage = (message: ErrorToastMessage | undefined, error: unknown) => {
  if (typeof message === 'function') return message(error);
  if (message) return message;
  if (error instanceof Error && error.message) return error.message;
  return 'Action failed. Please try again.';
};

export function confirmActionToast<Result = void>({
  id,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Dismiss',
  loading,
  success,
  error,
  onConfirm,
  onCancel,
}: ConfirmActionToastOptions<Result>) {
  return toast.warning(title, {
    id,
    description,
    duration: Infinity,
    closeButton: false,
    action: {
      label: confirmLabel,
      onClick: async (event) => {
        event.preventDefault();
        toast.loading(loading, {
          id,
          description,
          duration: Infinity,
          dismissible: false,
        });

        try {
          const result = await onConfirm();
          toast.success(resolveMessage(success, result), {
            id,
            duration: 4000,
          });
        } catch (toastError) {
          toast.error(resolveErrorMessage(error, toastError), {
            id,
            duration: 7000,
          });
        }
      },
    },
    cancel: {
      label: cancelLabel,
      onClick: () => {
        onCancel?.();
        toast.dismiss(id);
      },
    },
  });
}
