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

  it('shows model setup failures as runtime model preparation problems', () => {
    expect(apiErrorMessage({
      response: {
        data: {
          error: 'blueprint_model_install_failed',
          validation: {
            issues: [
              {
                code: 'runtime_model_install_failed',
                message: "llm: unknown runtime model 'gemma4:e2b'",
                location: { path: 'llm' },
              },
            ],
          },
        },
      },
      message: 'OtterDesk could not reach the MirrorNeuron runtime',
    }, 'Fallback')).toBe(
      'Required runtime model gemma4:e2b could not be prepared. Check model installation/runtime model settings and try again.',
    );
  });

  it('uses model install metadata when model setup issue text is generic', () => {
    expect(apiErrorMessage({
      response: {
        data: {
          error: 'blueprint_model_install_failed',
          model_install: {
            models: [{ id: 'gemma4:e2b', model: 'ai/gemma4:E2B' }],
          },
          validation: {
            issues: [
              {
                code: 'runtime_model_install_failed',
                message: 'hardware is not compatible',
                location: { path: 'llm' },
              },
            ],
          },
        },
      },
    }, 'Fallback')).toBe(
      'Required runtime model gemma4:e2b could not be prepared. Check model installation/runtime model settings and try again.',
    );
  });

  it('falls back to response detail, error message, then default text', () => {
    expect(apiErrorMessage({ response: { data: { detail: { message: 'Nested detail' } } } }, 'Fallback')).toBe('Nested detail');
    expect(apiErrorMessage({ message: 'Network failed' }, 'Fallback')).toBe('Network failed');
    expect(apiErrorMessage({}, 'Fallback')).toBe('Fallback');
  });
});
