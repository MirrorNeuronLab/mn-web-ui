import type { ReactNode } from 'react';

export type ActionMessage = ReactNode | {
  title: ReactNode;
  description?: ReactNode;
};

export type ResultMessage<Result> = ActionMessage | ((result: Result) => ActionMessage);
export type ErrorMessage = ActionMessage | ((error: unknown) => ActionMessage);

export type ConfirmActionDialogOptions<Result = void> = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  tone?: 'default' | 'danger';
  loading: ActionMessage;
  success: ResultMessage<Result>;
  error?: ErrorMessage;
  onConfirm: () => Promise<Result> | Result;
  onCancel?: () => void;
};

export type DialogRequest = ConfirmActionDialogOptions<unknown>;
type DialogListener = (request: DialogRequest) => void;

const listeners = new Set<DialogListener>();

export function subscribeToConfirmActions(listener: DialogListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function confirmActionDialog<Result = void>(options: ConfirmActionDialogOptions<Result>) {
  listeners.forEach((listener) => listener(options as DialogRequest));
}
