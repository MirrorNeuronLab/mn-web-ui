import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      closeButton
      expand
      richColors
      position="top-right"
      visibleToasts={5}
      containerAriaLabel="Action confirmations and notifications"
      toastOptions={{
        classNames: {
          actionButton: '!bg-neutral-950 !text-white hover:!bg-neutral-800',
          cancelButton: '!bg-white !text-neutral-700 !border !border-neutral-200 hover:!bg-neutral-50',
          description: '!text-neutral-600',
        },
      }}
    />
  );
}
