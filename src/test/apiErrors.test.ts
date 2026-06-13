import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from '../utils/apiErrors';

describe('apiErrorMessage', () => {
  it('prefers structured validation errors over generic messages', () => {
    expect(apiErrorMessage({
      response: {
        data: {
          error: 'validation_failed',
          validation: {
            errors: ['video_source.uri must use http:// or https://'],
          },
        },
      },
      message: 'Request failed',
    }, 'Fallback')).toBe('video_source.uri must use http:// or https://');
  });

  it('keeps the existing friendly GPU requirement wording', () => {
    expect(apiErrorMessage({
      response: {
        data: {
          validation: {
            issues: [
              {
                code: 'requirements.gpu_node_unavailable',
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
    }, 'Fallback')).toBe(
      'This blueprint needs an NVIDIA CUDA runtime node with more than 48GB GPU memory and CUDA newer than 12.0. Add or connect an NVIDIA node, then launch again.',
    );
  });

  it('falls back to response detail, error message, then default text', () => {
    expect(apiErrorMessage({ response: { data: { detail: { message: 'Nested detail' } } } }, 'Fallback')).toBe('Nested detail');
    expect(apiErrorMessage({ message: 'Network failed' }, 'Fallback')).toBe('Network failed');
    expect(apiErrorMessage({}, 'Fallback')).toBe('Fallback');
  });
});
