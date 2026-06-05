import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      closeButton
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'rounded-lg border border-neutral-200 bg-white text-neutral-950 shadow-lg',
          title: 'text-sm font-semibold text-neutral-950',
          description: 'text-xs text-neutral-600',
          actionButton: 'rounded-md bg-neutral-950 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800',
          cancelButton: 'rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50',
        },
      }}
      {...props}
    />
  );
}
