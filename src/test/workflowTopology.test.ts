import { describe, expect, it } from 'vitest';
import type { WorkflowProgress } from '../api';
import { buildWorkflowTopology } from '../utils/workflowTopology';

describe('buildWorkflowTopology', () => {
  it('uses source-facing monitor steps and merges explicit and per-step links without duplicates', () => {
    const progress = {
      steps: [
        { id: 'intake', children: ['research', 'review'] },
        { id: 'research', parents: ['intake'], children: ['review'] },
        { id: 'review', parents: ['intake', 'research'] },
      ],
      edges: [
        { id: 'intake_to_research', from: 'intake', to: 'research', event: 'intake_completed' },
        { from: 'runtime__start', to: 'research', event: 'internal' },
      ],
    } as unknown as WorkflowProgress;

    expect(buildWorkflowTopology(progress)).toEqual({
      steps: progress.steps,
      edges: [
        { id: 'intake_to_research', source: 'intake', target: 'research', event: 'intake_completed' },
        { id: 'intake->review', source: 'intake', target: 'review' },
        { id: 'research->review', source: 'research', target: 'review' },
      ],
    });
  });
});
