import { describe, expect, it } from 'vitest';
import type { SystemSummary } from '../api';
import {
  nodeIdentityBadges,
  nodeProfileTitle,
  nodeResourceMetrics,
  summarizeRuntimeResources,
} from '../utils/runtimeResources';

describe('runtime resource helpers', () => {
  const summary = {
    nodes: [
      {
        name: 'mirror_neuron@mac.local',
        connected_nodes: ['mirror_neuron@mac.local'],
        self: true,
        hardware: {
          platform: { os: 'darwin', family: 'unix' },
          cpu: { logical_processors: 12, load_ratio: 0.25, model: 'Apple M4 Max' },
          memory: { total_bytes: 34359738368, available_bytes: 17179869184 },
          devices: [
            {
              kind: 'gpu',
              type: 'apple/gpu',
              vendor: 'apple',
              driver: 'metal',
              api: 'metal',
              gpu_type: 'mac-metal',
              model: 'Apple M4 Max',
              memory_total_mb: 32768,
              capabilities: ['gpu', 'apple', 'metal'],
            },
          ],
        },
        executor_pools: {},
      },
    ],
    jobs: [],
  } satisfies SystemSummary;

  it('summarizes CPU, memory, and GPU resources from node hardware', () => {
    expect(summarizeRuntimeResources(summary)).toEqual(expect.objectContaining({
      nodeCount: 1,
      cpuCores: 12,
      cpuLoadRatio: 0.25,
      memoryTotalBytes: 34359738368,
      memoryUsedRatio: 0.5,
      gpuCount: 1,
      gpuMemoryTotalMb: 32768,
    }));
  });

  it('derives scan-friendly node metrics and identity badges', () => {
    const node = summary.nodes[0];

    expect(nodeResourceMetrics(node)).toEqual([
      { label: 'CPU', value: '12 cores', detail: '25% load' },
      { label: 'Memory', value: '32 / 32 GB', detail: 'GPU mem / total mem' },
      { label: 'GPU', value: '1 GPU', detail: 'Runtime GPU devices' },
    ]);
    expect(nodeIdentityBadges(node).map((badge) => badge.label)).toEqual(['macOS', 'Apple Metal']);
    expect(nodeProfileTitle(node)).toBe('CPU: Apple M4 Max | GPU: Apple M4 Max');
  });
});
