import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import RunJob from '../pages/RunJob';
import { fetchBlueprints, launchBlueprintJob, uploadBundle } from '../api';

vi.mock('../api', () => ({
  fetchBlueprints: vi.fn(),
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

const renderRunJob = () => render(<BrowserRouter><RunJob /></BrowserRouter>);

describe('RunJob Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(screen.getByText('Run a job')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Blueprint' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'File system path' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ZIP bundle' })).toBeInTheDocument();

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

    await waitFor(() => {
      expect(launchBlueprintJob).toHaveBeenCalledWith({ source: 'catalog', blueprint_id: 'worker_one' });
      expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-blueprint-123');
    });
  });

  it('launches a manually entered filesystem path', async () => {
    vi.mocked(launchBlueprintJob).mockResolvedValue({ job_id: 'job-path-123', id: 'job-path-123', status: 'pending' });
    renderRunJob();

    fireEvent.click(screen.getByRole('button', { name: 'File system path' }));
    fireEvent.change(screen.getByLabelText('Blueprint folder path'), {
      target: { value: '/Users/homer/Projects/mirror-neuron-set/otterdesk-blueprints/video_watch_assistant' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));

    await waitFor(() => {
      expect(launchBlueprintJob).toHaveBeenCalledWith({
        source: 'path',
        path: '/Users/homer/Projects/mirror-neuron-set/otterdesk-blueprints/video_watch_assistant',
      });
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
    fireEvent.click(screen.getByRole('button', { name: 'ZIP bundle' }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['dummy content'], 'bundle.zip', { type: 'application/zip' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadBundle).toHaveBeenCalled();
      expect(screen.getByText('Bundle uploaded')).toBeInTheDocument();
      expect(screen.getByText('test_graph')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Launch' }));

    await waitFor(() => {
      expect(launchBlueprintJob).toHaveBeenCalledWith({ source: 'bundle', _bundle_path: '/tmp/test_bundle' });
      expect(mockNavigate).toHaveBeenCalledWith('/jobs/job-zip-123');
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

    await waitFor(() => {
      expect(screen.getByText('video_source.uri must use http:// or https://')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
