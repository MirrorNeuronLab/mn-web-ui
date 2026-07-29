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

  it('keeps runtime-inserted steps and revised links visible', () => {
    const progress = {
      graph_revision: 1,
      steps: [
        { id: 'inspect_context', children: ['followup_research_1'] },
        {
          id: 'followup_research_1',
          template_id: 'followup_research',
          region_id: 'research_followups',
          parents: ['inspect_context'],
          children: ['write_report'],
        },
        { id: 'write_report', parents: ['followup_research_1'] },
      ],
      edges: [
        {
          id: 'inspect_to_followup',
          from: 'inspect_context',
          to: 'followup_research_1',
        },
        {
          id: 'followup_to_report',
          from: 'followup_research_1',
          to: 'write_report',
        },
      ],
    } as unknown as WorkflowProgress;

    const topology = buildWorkflowTopology(progress);

    expect(topology.steps.map((step) => step.id)).toEqual([
      'inspect_context',
      'followup_research_1',
      'write_report',
    ]);
    expect(topology.edges.map((edge) => [edge.source, edge.target])).toEqual([
      ['inspect_context', 'followup_research_1'],
      ['followup_research_1', 'write_report'],
    ]);
  });
});
