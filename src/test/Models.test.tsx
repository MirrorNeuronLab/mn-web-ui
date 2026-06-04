import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Models from '../pages/Models';
import { benchmarkRuntimeModel, fetchRuntimeModels } from '../api';
import { TooltipProvider } from '../components/ui/tooltip';

vi.mock('../api', () => ({
  benchmarkRuntimeModel: vi.fn(),
  fetchRuntimeModels: vi.fn(),
}));

const renderModels = () => render(
  <TooltipProvider>
    <Models />
  </TooltipProvider>
);

describe('Models Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists installed models and benchmarks one in a modal', async () => {
    vi.mocked(fetchRuntimeModels).mockResolvedValue({
      node: 'mn1@local',
      runner_available: true,
      warnings: [],
      models: [
        {
          id: 'gemma4:e2b',
          name: 'Gemma 4 E2B',
          provider: 'docker_model_runner',
          model: 'ai/gemma4:E2B',
          docker_model: 'ai/gemma4:E2B',
          api_model: 'ai/gemma4:E2B',
          backend: 'llama.cpp',
          installed: true,
          node: 'mn1@local',
          nodes: ['mn1@local'],
          used_by: ['personal_income_tax_expert'],
          owner_count: 1,
          orphaned: false,
          manual: false,
          compatibility: {
            status: 'pass',
            ok: true,
            message: 'ready',
            warnings: [],
          },
        },
      ],
    });
    vi.mocked(benchmarkRuntimeModel).mockResolvedValue({
      model: 'gemma4:e2b',
      name: 'Gemma 4 E2B',
      docker_model: 'ai/gemma4:E2B',
      api_model: 'ai/gemma4:E2B',
      node: 'mn1@local',
      elapsed_ms: 1200,
      first_token_ms: 340,
      generated_tokens: 15,
      tokens_per_second: 12.5,
      sample: 'Ready now.',
      estimated: true,
    });

    renderModels();

    expect(await screen.findByText('Gemma 4 E2B')).toBeInTheDocument();
    expect(screen.getByText('ai/gemma4:E2B')).toBeInTheDocument();
    expect(screen.getByText('personal_income_tax_expert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /benchmark/i }));

    await waitFor(() => expect(benchmarkRuntimeModel).toHaveBeenCalledWith('gemma4:e2b'));
    const dialog = await screen.findByRole('dialog', { name: /benchmark model/i });
    expect(within(dialog).getByText('12.5 tok/s')).toBeInTheDocument();
    expect(within(dialog).getByText('340ms')).toBeInTheDocument();
    expect(within(dialog).getByText('Ready now.')).toBeInTheDocument();
  });

  it('shows an empty installed-state message without install controls', async () => {
    vi.mocked(fetchRuntimeModels).mockResolvedValue({
      node: 'mn1@local',
      runner_available: true,
      warnings: [],
      models: [],
    });

    renderModels();

    expect(await screen.findByText(/No installed models yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();
  });
});
