import { isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CircleHelp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import {
  subscribeToConfirmActions,
  type ActionMessage,
  type DialogRequest,
  type ErrorMessage,
  type ResultMessage,
} from './confirm-action';
type NeutralToastOptions = NonNullable<Parameters<typeof toast.message>[1]> & { type?: 'default' };

const isMessageObject = (value: ActionMessage): value is { title: ReactNode; description?: ReactNode } => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && !isValidElement(value)
  && 'title' in value
);

const messageContent = (message: ActionMessage) => (
  isMessageObject(message) ? message : { title: message, description: undefined }
);

const resolveResultMessage = <Result,>(message: ResultMessage<Result>, result: Result): ActionMessage => (
  typeof message === 'function' ? message(result) : message
);

const resolveErrorMessage = (message: ErrorMessage | undefined, error: unknown): ActionMessage => {
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

export function ConfirmActionDialogHost() {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const handlingConfirm = useRef(false);

  useEffect(() => {
    return subscribeToConfirmActions((nextRequest) => {
      handlingConfirm.current = false;
      setRequest(nextRequest);
    });
  }, []);

  const dismiss = () => {
    if (!request || handlingConfirm.current) return;
    const onCancel = request.onCancel;
    setRequest(null);
    onCancel?.();
  };

  const confirm = async () => {
    if (!request || handlingConfirm.current) return;
    handlingConfirm.current = true;
    const activeRequest = request;

    // The confirmation has served its purpose. Close it before starting work so
    // page-level progress dialogs and loading states never compete with it.
    setRequest(null);
    const loadingMessage = messageContent(activeRequest.loading);
    toast.loading(loadingMessage.title, {
      id: activeRequest.id,
      action: undefined,
      cancel: undefined,
      closeButton: false,
      description: loadingMessage.description,
      duration: Infinity,
      dismissible: false,
    });

    try {
      const result = await activeRequest.onConfirm();
      const successMessage = messageContent(resolveResultMessage(activeRequest.success, result));
      neutralToast(successMessage.title, {
        id: activeRequest.id,
        action: undefined,
        cancel: undefined,
        description: successMessage.description,
        dismissible: true,
        duration: 4000,
      });
    } catch (actionError) {
      const errorMessage = messageContent(resolveErrorMessage(activeRequest.error, actionError));
      neutralToast(errorMessage.title, {
        id: activeRequest.id,
        action: undefined,
        cancel: undefined,
        description: errorMessage.description,
        dismissible: true,
        duration: 7000,
      });
    } finally {
      handlingConfirm.current = false;
    }
  };

  const isDanger = request?.tone === 'danger';
  const Icon = isDanger ? AlertTriangle : CircleHelp;

  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => { if (!open) dismiss(); }}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0" showClose>
        <DialogHeader className="border-b border-neutral-100 px-6 py-5 pr-14">
          <div className="flex items-start gap-3">
            <div className={isDanger
              ? 'mt-0.5 rounded-full bg-red-50 p-2 text-red-600'
              : 'mt-0.5 rounded-full bg-neutral-100 p-2 text-neutral-700'}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <DialogTitle className="text-lg leading-6">{request?.title}</DialogTitle>
              {request?.description ? (
                <DialogDescription className="leading-5 text-neutral-600">
                  {request.description}
                </DialogDescription>
              ) : (
                <DialogDescription className="sr-only">Confirm or cancel this action.</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 text-xs leading-5 text-neutral-500">
          {isDanger
            ? 'This may interrupt work in progress. Check the details before continuing.'
            : 'Review the details, then confirm when you are ready.'}
        </div>

        <DialogFooter className="border-t border-neutral-100 bg-neutral-50 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:min-w-24 sm:w-auto"
            onClick={dismiss}
            autoFocus
          >
            {request?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            type="button"
            variant={isDanger ? 'destructive' : 'default'}
            className="w-full sm:min-w-24 sm:w-auto"
            onClick={() => void confirm()}
          >
            {request?.confirmLabel ?? 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
