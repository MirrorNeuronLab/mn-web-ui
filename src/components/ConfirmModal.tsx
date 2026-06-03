import type { ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

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
  error = null
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="animate-in fade-in zoom-in w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl duration-200">
        <div className="flex items-start justify-between border-b border-neutral-100 p-4">
          <div className="flex items-center gap-2.5 text-neutral-700">
            <div className="rounded-full bg-neutral-50 p-1.5">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-neutral-950">{title}</h3>
          </div>
          <button 
            onClick={onCancel}
            disabled={isProcessing}
            className="text-neutral-400 transition-colors hover:text-neutral-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        
        <div className="p-4 text-sm text-neutral-600">
          {message}
          {error && (
            <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800">
              {error}
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-2 border-t border-neutral-100 bg-neutral-50 p-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isProcessing}
            className="flex items-center gap-1.5 rounded-md bg-neutral-950 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-70"
          >
            {isProcessing && (
              <svg className="h-3.5 w-3.5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
