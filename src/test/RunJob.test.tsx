import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { toast } from 'sonner';
import RunJob from '../pages/RunJob';
import { fetchBlueprints, fetchLaunchProgress, launchBlueprintJob, uploadBundle } from '../api';
import { Toaster } from '../components/ui/sonner';
import { TooltipProvider } from '../components/ui/tooltip';

vi.mock('../api', () => ({
  fetchBlueprints: vi.fn(),
  fetchLaunchProgress: vi.fn(),
  launchBlueprintJob: vi.fn(),
  uploadBundle: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const renderRunJob = () => render(
  <TooltipProvider>
    <BrowserRouter><RunJob /></BrowserRouter>
    <Toaster />
  </TooltipProvider>
);

describe('RunJob Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toast.dismiss();
    vi.mocked(fetchLaunchProgress).mockResolvedValue({
      progress_id: 'launch-test',
      events: [],
      latest: null,
      completed: false,
    });
    vi.mocked(fetchBlueprints).mockResolvedValue({
      repo_dir: '/repo',
      blueprints: [
        { id: 'worker_one', name: 'Worker One', description: 'Runs one worker.' },
        { id: 'tax_expert', name: 'Tax Expert', description: 'Prepare tax workpapers.' },
      ],
      categories: [],
    });
  });

  it('renders run a job with source tabs', async () => {
    renderRunJob();
    expect(screen.getByRole('tab', { name: 'Blueprint' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'File system path' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'ZIP bundle' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('Worker One').length).toBeGreaterThan(0);
    });
  });

  it('launches a selected blueprint through the launch endpoint', async () => {
    vi.mocked(launchBlueprintJob).mockResolvedValue({ job_id: 'job-blueprint-123', id: 'job-blueprint-123', status: 'pending' });
    renderRunJob();

    await waitFor(() => {
      expect(screen.getAllByText('Worker One').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    expect(await screen.findByText('Launch this job?')).toBeInTheDocument();
    expect(launchBlueprintJob).not.toHaveBeenCalled();

    const launchButtons = screen.getAllByRole('button', { name: 'Launch' });
    fireEvent.click(launchButtons[launchButtons.length - 1]);

    await waitFor(() => {
      expect(launchBlueprintJob).toHaveBeenCalledWith(expect.objectContaining({ source: 'catalog', blueprint_id: 'worker_one' }));
      const payload = vi.mocked(launchBlueprintJob).mock.calls[0][0] as Record<string, unknown>;
      expect(String(payload.progress_id)).toMatch(/^launch-/);
      expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-blueprint-123');
    });
  });

  it('launches a manually entered filesystem path', async () => {
    vi.mocked(launchBlueprintJob).mockResolvedValue({ job_id: 'job-path-123', id: 'job-path-123', status: 'pending' });
    renderRunJob();

    fireEvent.click(screen.getByRole('tab', { name: 'File system path' }));
    fireEvent.change(screen.getByLabelText('Blueprint folder path'), {
      target: { value: '/Users/homer/Projects/mirror-neuron-set/otterdesk-blueprints/video_watch_assistant' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    expect(await screen.findByText('Launch this job?')).toBeInTheDocument();
    expect(launchBlueprintJob).not.toHaveBeenCalled();

    const launchButtons = screen.getAllByRole('button', { name: 'Launch' });
    fireEvent.click(launchButtons[launchButtons.length - 1]);

    await waitFor(() => {
      expect(launchBlueprintJob).toHaveBeenCalledWith(expect.objectContaining({
        source: 'path',
        path: '/Users/homer/Projects/mirror-neuron-set/otterdesk-blueprints/video_watch_assistant',
      }));
      const payload = vi.mocked(launchBlueprintJob).mock.calls[0][0] as Record<string, unknown>;
      expect(String(payload.progress_id)).toMatch(/^launch-/);
      expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-path-123');
    });
  });

  it('uploads and launches a zip bundle through the launch endpoint', async () => {
    vi.mocked(uploadBundle).mockResolvedValue({
      bundle_path: '/tmp/test_bundle',
      manifest: { graph_id: 'test_graph' },
    });
    vi.mocked(launchBlueprintJob).mockResolvedValue({ job_id: 'job-zip-123', id: 'job-zip-123', status: 'pending' });

    renderRunJob();
    fireEvent.click(screen.getByRole('tab', { name: 'ZIP bundle' }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy content'], 'bundle.zip', { type: 'application/zip' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByText('Upload this ZIP bundle?')).toBeInTheDocument();
    expect(uploadBundle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Upload ZIP' }));

    await waitFor(() => {
      expect(uploadBundle).toHaveBeenCalled();
      expect(screen.getByText('Bundle uploaded')).toBeInTheDocument();
      expect(screen.getByText('test_graph')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    expect(await screen.findByText('Launch this job?')).toBeInTheDocument();
    expect(launchBlueprintJob).not.toHaveBeenCalled();

    const launchButtons = screen.getAllByRole('button', { name: 'Launch' });
    fireEvent.click(launchButtons[launchButtons.length - 1]);

    await waitFor(() => {
      expect(launchBlueprintJob).toHaveBeenCalledWith(expect.objectContaining({ source: 'bundle', _bundle_path: '/tmp/test_bundle' }));
      const payload = vi.mocked(launchBlueprintJob).mock.calls[0][0] as Record<string, unknown>;
      expect(String(payload.progress_id)).toMatch(/^launch-/);
      expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-zip-123');
    });
  });

  it('shows launch progress while a blueprint launch is running', async () => {
    let resolveLaunch: (value: { job_id: string; id: string; status: string }) => void = () => {};
    vi.mocked(launchBlueprintJob).mockImplementation(() => new Promise((resolve) => {
      resolveLaunch = resolve;
    }));
    vi.mocked(fetchLaunchProgress).mockResolvedValue({
      progress_id: 'launch-test',
      events: [
        { phase: 'resolve_source', status: 'completed', message: 'Blueprint source resolved.' },
        { phase: 'model_install', status: 'running', message: 'Ensuring required runtime models are installed.' },
      ],
      latest: { phase: 'model_install', status: 'running', message: 'Ensuring required runtime models are installed.' },
      completed: false,
    });

    renderRunJob();
    await waitFor(() => {
      expect(screen.getAllByText('Worker One').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    expect(await screen.findByText('Launch this job?')).toBeInTheDocument();

    const launchButtons = screen.getAllByRole('button', { name: 'Launch' });
    fireEvent.click(launchButtons[launchButtons.length - 1]);

    const progressDialog = await screen.findByRole('dialog', { name: 'Progress' });
    await waitFor(() => {
      expect(within(progressDialog).getByText('Install required runtime models')).toBeInTheDocument();
      expect(within(progressDialog).getByText('Ensuring required runtime models are installed.')).toBeInTheDocument();
    });

    resolveLaunch({ job_id: 'job-progress-123', id: 'job-progress-123', status: 'pending' });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-progress-123');
    });
  });

  it('shows mn blueprint validate errors from launch', async () => {
    vi.mocked(launchBlueprintJob).mockRejectedValue({
      response: {
        data: {
          detail: 'Fix the highlighted blueprint validation issues and launch again.',
          validation: {
            errors: ['video_source.uri must use http:// or https://'],
          },
        },
      },
      message: 'Request failed with status code 422',
    });

    renderRunJob();
    await waitFor(() => {
      expect(screen.getAllByText('Worker One').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    expect(await screen.findByText('Launch this job?')).toBeInTheDocument();

    const launchButtons = screen.getAllByRole('button', { name: 'Launch' });
    fireEvent.click(launchButtons[launchButtons.length - 1]);

    await waitFor(() => {
      expect(screen.getByText('video_source.uri must use http:// or https://')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows friendly hardware requirement text when an NVIDIA runtime node is needed', async () => {
    vi.mocked(launchBlueprintJob).mockRejectedValue({
      response: {
        data: {
          error: 'requirements_not_met',
          detail: "Add or connect a runtime node that meets this blueprint's hardware requirements, then launch again.",
          validation: {
            errors: ['gpu: validation failed'],
            issues: [
              {
                code: 'requirements.gpu_node_unavailable',
                message: 'gpu requirement validation failed',
                location: { source: 'requirements', path: 'gpu' },
                expected: {
                  vendor: 'nvidia',
                  driver: 'cuda',
                  min_api_version: '12.0',
                  api_version_operator: '>',
                  min_memory_mb: 49152,
                  memory_operator: '>',
                },
              },
            ],
          },
        },
      },
      message: 'Request failed with status code 412',
    });

    renderRunJob();
    await waitFor(() => {
      expect(screen.getAllByText('Worker One').length).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));
    expect(await screen.findByText('Launch this job?')).toBeInTheDocument();

    const launchButtons = screen.getAllByRole('button', { name: 'Launch' });
    fireEvent.click(launchButtons[launchButtons.length - 1]);

    await waitFor(() => {
      expect(
        screen.getByText(
          'This blueprint needs an NVIDIA CUDA runtime node with more than 48GB GPU memory and CUDA newer than 12.0. Add or connect an NVIDIA node, then launch again.',
        ),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText('gpu: validation failed')).not.toBeInTheDocument();
    expect(screen.queryByText(/wrong/i)).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
