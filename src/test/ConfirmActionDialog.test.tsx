import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import {
  ConfirmActionDialogHost,
} from '../components/ui/confirm-action-dialog';
import { confirmActionDialog } from '../components/ui/confirm-action';
import { Toaster } from '../components/ui/sonner';

function renderHarness(onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(
    <>
      <button
        type="button"
        onClick={() => confirmActionDialog({
          id: 'confirm-test',
          title: 'Cancel this job?',
          description: 'Running agents will be interrupted.',
          confirmLabel: 'Cancel job',
          cancelLabel: 'Keep running',
          tone: 'danger',
          loading: 'Cancelling job',
          success: 'Job cancelled',
          error: 'Cancel failed',
          onConfirm,
          onCancel,
        })}
      >
        Open confirmation
      </button>
      <ConfirmActionDialogHost />
      <Toaster />
    </>,
  );
}

describe('ConfirmActionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast.dismiss();
  });

  it('opens an accessible centered confirmation and gives cancel initial focus', async () => {
    renderHarness();
    fireEvent.click(screen.getByRole('button', { name: 'Open confirmation' }));

    const dialog = await screen.findByRole('dialog', { name: 'Cancel this job?' });
    expect(dialog).toHaveTextContent('Running agents will be interrupted.');
    expect(screen.getByRole('button', { name: 'Keep running' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Cancel job' })).toHaveClass('bg-red-600');
  });

  it('dismisses without running the action', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderHarness(onConfirm, onCancel);
    fireEvent.click(screen.getByRole('button', { name: 'Open confirmation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep running' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes before work starts and reports completion as a notification', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderHarness(onConfirm);
    fireEvent.click(screen.getByRole('button', { name: 'Open confirmation' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel job' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(await screen.findByText('Job cancelled')).toBeInTheDocument();
  });
});
