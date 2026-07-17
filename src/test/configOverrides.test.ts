import { describe, expect, it } from 'vitest';
import { parseConfigOverrideAssignments } from '../utils/configOverrides';

describe('parseConfigOverrideAssignments', () => {
  it('matches mn-cli dotted --set parsing and JSON value coercion', () => {
    expect(parseConfigOverrideAssignments([
      'llm.configs.primary.context_size=8192',
      'features.research=true',
      'inputs.companies=["Acme","Globex"]',
      'service.metadata={"tier":"gold"}',
      'service.url=https://example.test/query?a=b',
      'label=plain text',
    ].join('\n'))).toEqual({
      ok: true,
      count: 6,
      value: {
        llm: { configs: { primary: { context_size: 8192 } } },
        features: { research: true },
        inputs: { companies: ['Acme', 'Globex'] },
        service: {
          metadata: { tier: 'gold' },
          url: 'https://example.test/query?a=b',
        },
        label: 'plain text',
      },
    });
  });

  it('uses the last assignment and replaces scalar path parents like mn-cli', () => {
    expect(parseConfigOverrideAssignments('llm=disabled\nllm.model=default\nllm.model=fast')).toEqual({
      ok: true,
      count: 3,
      value: { llm: { model: 'fast' } },
    });
  });

  it('reports the line for malformed assignments and dotted paths', () => {
    expect(parseConfigOverrideAssignments('valid.path=1\nmissing-value')).toEqual({
      ok: false,
      error: 'Line 2: expected dotted.path=value.',
    });
    expect(parseConfigOverrideAssignments('llm..model=default')).toEqual({
      ok: false,
      error: 'Line 1: expected non-empty dotted path segments.',
    });
  });
});
