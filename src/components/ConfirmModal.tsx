import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing?: boolean;
  error?: string | null;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isProcessing = false,
  error = null,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isProcessing) onCancel();
      }}
    >
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0" showClose={!isProcessing}>
        <DialogHeader className="border-b border-neutral-100 p-4 pr-12">
          <div className="flex items-center gap-2.5 text-neutral-700">
            <div className="rounded-full bg-neutral-50 p-1.5">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="sr-only">Confirm or cancel this action.</DialogDescription>
        </DialogHeader>

        <div className="p-4 text-sm text-neutral-600">
          {message}
          {error ? (
            <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-neutral-100 bg-neutral-50 p-3">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isProcessing}>
            {cancelLabel}
          </Button>
          <Button type="button" size="sm" onClick={onConfirm} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
