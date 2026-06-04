import { isValidElement, type ReactNode } from 'react';
import { toast } from 'sonner';

type ToastContent = ReactNode | {
  title: ReactNode;
  description?: ReactNode;
};
type ToastMessage<Result> = ToastContent | ((result: Result) => ToastContent);
type ErrorToastMessage = ToastContent | ((error: unknown) => ToastContent);
type NeutralToastOptions = NonNullable<Parameters<typeof toast.message>[1]> & { type?: 'default' };

type ConfirmActionToastOptions<Result> = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  loading: ToastContent;
  success: ToastMessage<Result>;
  error?: ErrorToastMessage;
  onConfirm: () => Promise<Result> | Result;
  onCancel?: () => void;
};

const isToastContentObject = (value: ToastContent): value is { title: ReactNode; description?: ReactNode } => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && !isValidElement(value)
  && 'title' in value
);

const toastContent = (message: ToastContent) => (
  isToastContentObject(message) ? message : { title: message, description: undefined }
);

const resolveMessage = <Result,>(message: ToastMessage<Result>, result: Result): ToastContent => (
  typeof message === 'function' ? message(result) : message
);

const resolveErrorMessage = (message: ErrorToastMessage | undefined, error: unknown): ToastContent => {
  if (typeof message === 'function') return message(error);
  if (message) return message;
  if (error instanceof Error && error.message) {
    return { title: 'Action failed', description: error.message };
  }
  return { title: 'Action failed', description: 'Please try again.' };
};

const neutralToast = (message: ReactNode, options: NeutralToastOptions) => (
  toast.message(message, { type: 'default', ...options } as Parameters<typeof toast.message>[1])
);

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
  const initialToast = toastContent({ title, description });
  return neutralToast(initialToast.title, {
    id,
    description: initialToast.description,
    duration: Infinity,
    dismissible: true,
    closeButton: false,
    action: {
      label: confirmLabel,
      onClick: async (event) => {
        event.preventDefault();
        const loadingToast = toastContent(loading);
        toast.loading(loadingToast.title, {
          id,
          action: undefined,
          cancel: undefined,
          closeButton: false,
          description: loadingToast.description,
          duration: Infinity,
          dismissible: false,
        });

        try {
          const result = await onConfirm();
          const successToast = toastContent(resolveMessage(success, result));
          neutralToast(successToast.title, {
            id,
            action: undefined,
            cancel: undefined,
            closeButton: undefined,
            description: successToast.description,
            dismissible: true,
            duration: 4000,
          });
        } catch (toastError) {
          const errorToast = toastContent(resolveErrorMessage(error, toastError));
          neutralToast(errorToast.title, {
            id,
            action: undefined,
            cancel: undefined,
            closeButton: undefined,
            description: errorToast.description,
            dismissible: true,
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
