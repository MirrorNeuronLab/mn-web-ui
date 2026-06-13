import { describe, expect, it } from 'vitest';
import type { WorkflowActivity } from '../api';
import { activityCategory, activityDetailText, uniqueActivities } from '../utils/workflowActivity';

describe('workflow activity helpers', () => {
  it('categorizes inferred activity types and deduplicates repeated events', () => {
    const activities: WorkflowActivity[] = [
      { timestamp: '2026-06-12T12:00:00Z', type: 'agent_activity', message: 'Planning' },
      { timestamp: '2026-06-12T12:00:00Z', type: 'agent_activity', message: 'Planning' },
      { timestamp: '2026-06-12T12:00:01Z', type: 'tool_call_completed', tool_name: 'browser' },
      { timestamp: '2026-06-12T12:00:02Z', type: 'artifact_created' },
      { timestamp: '2026-06-12T12:00:03Z', type: 'worker_failed' },
    ];

    expect(activities.map(activityCategory)).toEqual(['agent', 'agent', 'tool', 'artifact', 'error']);
    expect(uniqueActivities(activities)).toHaveLength(4);
  });

  it('formats detail payloads only when useful fields are present', () => {
    expect(activityDetailText({ type: 'agent_activity' })).toBe('');
    expect(activityDetailText({
      type: 'tool_call_completed',
      target: 'https://example.com',
      status: 'completed',
      duration_ms: 120,
    })).toContain('https://example.com');
  });
});
