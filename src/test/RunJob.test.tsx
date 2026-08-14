import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { toast } from 'sonner';
import RunJob from '../pages/RunJob';
import { fetchBlueprints, launchBlueprintJob, uploadBundle } from '../api';
import { Toaster } from '../components/ui/sonner';
import { TooltipProvider } from '../components/ui/tooltip';
import { ConfirmActionDialogHost } from '../components/ui/confirm-action-dialog';

vi.mock('../api', () => ({
  fetchBlueprints: vi.fn(),
  launchBlueprintJob: vi.fn(),
  uploadBundle: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const renderRunJob = () => render(
  <TooltipProvider>
    <BrowserRouter><RunJob /></BrowserRouter>
    <ConfirmActionDialogHost />
    <Toaster />
  </TooltipProvider>,
);

describe('RunJob Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast.dismiss();
    vi.mocked(fetchBlueprints).mockResolvedValue({
      items: [
        { id: 'worker_one', name: 'Worker One', description: 'Runs one worker.' },
        { id: 'tax_expert', name: 'Tax Expert', description: 'Prepare tax workpapers.' },
      ],
      next_page_token: null,
    });
  });

  it('offers only canonical blueprint and opaque bundle sources', async () => {
    renderRunJob();
    expect(screen.getByRole('tab', { name: 'Blueprint' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ZIP bundle' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'File system path' })).not.toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Blueprint' })).toHaveValue('worker_one');
  });

  it('creates a run directly from a catalog blueprint without version or progress aliases', async () => {
    vi.mocked(launchBlueprintJob).mockResolvedValue({
      job_id: 'job-blueprint-123',
      run_id: 'run-blueprint-123',
      status: 'pending',
    });
    renderRunJob();
    await screen.findByRole('combobox', { name: 'Blueprint' });

    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Launch' }));

    await waitFor(() => {
      expect(launchBlueprintJob).toHaveBeenCalledWith({
        source: 'catalog',
        blueprint_id: 'worker_one',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/runs/run-blueprint-123');
    });
  });

  it('sends nested configuration overrides with a blueprint run', async () => {
    vi.mocked(launchBlueprintJob).mockResolvedValue({ run_id: 'run-config-123', status: 'pending' });
    renderRunJob();
    await screen.findByRole('combobox', { name: 'Blueprint' });
    fireEvent.click(screen.getByText('Run configuration'));
    fireEvent.change(screen.getByLabelText('Configuration overrides'), {
      target: { value: 'llm.configs.primary.context_size=8192\nfeatures.research=true' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Launch' })).at(-1)!);

    await waitFor(() => expect(launchBlueprintJob).toHaveBeenCalledWith({
      source: 'catalog',
      blueprint_id: 'worker_one',
      config_overrides: {
        llm: { configs: { primary: { context_size: 8192 } } },
        features: { research: true },
      },
    }));
  });

  it('blocks malformed run configuration overrides', async () => {
    renderRunJob();
    await screen.findByRole('combobox', { name: 'Blueprint' });
    fireEvent.click(screen.getByText('Run configuration'));
    fireEvent.change(screen.getByLabelText('Configuration overrides'), {
      target: { value: 'llm..model=default' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('expected non-empty dotted path segments');
    expect(screen.getByRole('button', { name: 'Launch' })).toBeDisabled();
  });

  it('uploads a ZIP and launches it by opaque bundle_id', async () => {
    vi.mocked(uploadBundle).mockResolvedValue({ bundle_id: 'bundle_01JABC' });
    vi.mocked(launchBlueprintJob).mockResolvedValue({
      job_id: 'job-zip-123',
      run_id: 'run-zip-123',
      status: 'pending',
    });
    renderRunJob();
    fireEvent.click(screen.getByRole('tab', { name: 'ZIP bundle' }));
    const file = new File(['bundle'], 'bundle.zip', { type: 'application/zip' });
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Upload ZIP' }));
    expect(await screen.findByText('bundle_01JABC')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Launch' })).at(-1)!);
    await waitFor(() => {
      expect(launchBlueprintJob).toHaveBeenCalledWith({ source: 'bundle', bundle_id: 'bundle_01JABC' });
      expect(mockNavigate).toHaveBeenCalledWith('/runs/run-zip-123');
    });
  });

  it('surfaces a rejected canonical run creation', async () => {
    vi.mocked(launchBlueprintJob).mockRejectedValue({
      response: { data: { detail: 'Blueprint validation failed.', code: 'request.validation_failed' } },
    });
    renderRunJob();
    await screen.findByRole('combobox', { name: 'Blueprint' });
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Launch' }));
    await waitFor(() => expect(launchBlueprintJob).toHaveBeenCalled());
    expect(await screen.findAllByText('Blueprint validation failed.')).not.toHaveLength(0);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
