import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, Boxes, Gauge, Loader2, RefreshCw, Server, X } from 'lucide-react';
import { benchmarkRuntimeModel, fetchRuntimeModels } from '../api';
import type { RuntimeModel, RuntimeModelBenchmark, RuntimeModelListResponse } from '../api';
import { Tooltip } from '../components/ui/tooltip';

export default function Models() {
  const [modelState, setModelState] = useState<RuntimeModelListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedModel, setSelectedModel] = useState<RuntimeModel | null>(null);
  const [benchmark, setBenchmark] = useState<RuntimeModelBenchmark | null>(null);
  const [benchmarking, setBenchmarking] = useState(false);
  const [benchmarkError, setBenchmarkError] = useState('');

  const loadModels = useCallback(async () => {
    try {
      const result = await fetchRuntimeModels();
      setModelState(result);
      setError('');
    } catch (loadError) {
      console.error('Failed to load runtime models', loadError);
      setModelState(null);
      setError(apiErrorMessage(loadError, 'Could not load installed models.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadModels();
    }, 0);
    const refreshTimer = window.setInterval(() => {
      void loadModels();
    }, 10000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadModels]);

  const models = useMemo(() => modelState?.models || [], [modelState]);
  const ownedCount = models.filter((model) => (model.owner_count || 0) > 0).length;
  const orphanedCount = models.filter((model) => model.orphaned).length;

  const runBenchmark = useCallback(async (model: RuntimeModel) => {
    setSelectedModel(model);
    setBenchmark(null);
    setBenchmarkError('');
    setBenchmarking(true);
    try {
      const result = await benchmarkRuntimeModel(modelKey(model));
      setBenchmark(result);
    } catch (runError) {
      console.error('Failed to benchmark runtime model', runError);
      setBenchmarkError(apiErrorMessage(runError, 'Benchmark failed.'));
    } finally {
      setBenchmarking(false);
    }
  }, []);

  const openBenchmark = (model: RuntimeModel) => {
    setSelectedModel(model);
    void runBenchmark(model);
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 rounded-lg border border-neutral-200 bg-white p-5">
              <div className="h-4 w-28 rounded bg-neutral-100" />
              <div className="mt-5 h-7 w-16 rounded bg-neutral-100" />
              <div className="mt-5 h-4 w-40 rounded bg-neutral-100" />
            </div>
          ))}
        </div>
        <div className="h-80 rounded-lg border border-neutral-200 bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard
          icon={Boxes}
          label="Installed Models"
          value={models.length.toLocaleString()}
          detail={`${modelState?.node || 'local'} runtime node`}
        />
        <MetricCard
          icon={Activity}
          label="Blueprint-Owned"
          value={ownedCount.toLocaleString()}
          detail="Installed by blueprint requirements"
        />
        <MetricCard
          icon={AlertCircle}
          label="Orphaned"
          value={orphanedCount.toLocaleString()}
          detail="Available for later cleanup"
        />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-neutral-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold tracking-tight text-neutral-950">Models</h2>
            <p className="mt-1 text-xs text-neutral-500">Installed Docker Model Runner models available to blueprints.</p>
          </div>
          <Tooltip content="Refresh installed model status.">
            <button
              type="button"
              onClick={() => void loadModels()}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </Tooltip>
        </div>

        {error ? (
          <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-xs text-red-700">{error}</div>
        ) : null}
        {(modelState?.warnings || []).map((warning, index) => (
          <div key={`${warning}-${index}`} className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-800">
            {warning}
          </div>
        ))}

        {models.length === 0 ? (
          <div className="px-5 py-10 text-sm text-neutral-500">
            No installed models yet. Models appear here after a blueprint installs one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed divide-y divide-neutral-100 text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-500">
                <tr>
                  <th scope="col" className="w-[32%] px-5 py-3 font-medium">Model</th>
                  <th scope="col" className="w-[20%] px-4 py-3 font-medium">Node</th>
                  <th scope="col" className="w-[12%] px-4 py-3 font-medium">Backend</th>
                  <th scope="col" className="w-[18%] px-4 py-3 font-medium">Used By</th>
                  <th scope="col" className="w-[10%] px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="w-[8%] px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {models.map((model) => {
                  const status = modelStatus(model);
                  const canBenchmark = model.provider === 'docker_model_runner';
                  return (
                    <tr key={`${model.id}-${model.docker_model}`} className="align-top">
                      <td className="px-5 py-4">
                        <div className="flex min-w-0 gap-3">
                          <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
                          <div className="min-w-0">
                            <div className="font-medium text-neutral-950">{model.name || model.id}</div>
                            <div className="mt-1 break-all font-mono text-[11px] leading-5 text-neutral-500">{model.docker_model || model.model}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex min-w-0 items-center gap-2 text-neutral-700">
                          <Server className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                          <span className="truncate" title={nodeLabel(model)}>{nodeLabel(model)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-neutral-700">{model.backend || 'unknown'}</td>
                      <td className="px-4 py-4 text-neutral-700">
                        <span className="line-clamp-2" title={ownerLabel(model)}>{ownerLabel(model)}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex h-6 items-center rounded-full px-2 text-[11px] font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Tooltip content={canBenchmark ? 'Benchmark this model from the runtime node.' : 'Benchmark is only available for Docker Model Runner chat models.'}>
                          <span className="inline-flex">
                            <button
                              type="button"
                              onClick={() => openBenchmark(model)}
                              disabled={!canBenchmark}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Gauge className="h-3.5 w-3.5" />
                              Benchmark
                            </button>
                          </span>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BenchmarkDialog
        benchmark={benchmark}
        error={benchmarkError}
        loading={benchmarking}
        model={selectedModel}
        onClose={() => {
          if (benchmarking) return;
          setSelectedModel(null);
          setBenchmark(null);
          setBenchmarkError('');
        }}
        onRun={() => {
          if (selectedModel) void runBenchmark(selectedModel);
        }}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-neutral-500">
        <span>{label}</span>
        <Icon className="h-4 w-4 text-neutral-500" />
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-neutral-950">{value}</div>
      <div className="mt-5 text-xs text-neutral-500">{detail}</div>
    </div>
  );
}

function BenchmarkDialog({
  benchmark,
  error,
  loading,
  model,
  onClose,
  onRun,
}: {
  benchmark: RuntimeModelBenchmark | null;
  error: string;
  loading: boolean;
  model: RuntimeModel | null;
  onClose: () => void;
  onRun: () => void;
}) {
  if (!model) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-benchmark-title"
        className="w-full max-w-xl overflow-hidden rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 p-4">
          <div className="min-w-0">
            <h3 id="model-benchmark-title" className="font-semibold text-neutral-950">Benchmark Model</h3>
            <p className="mt-1 break-all font-mono text-[11px] text-neutral-500">{model.docker_model || model.model}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {loading ? (
            <div className="flex items-center gap-3 rounded-md border border-neutral-200 p-4 text-sm text-neutral-700">
              <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
              Measuring remote response from {nodeLabel(model)}.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
          ) : null}

          {benchmark ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <BenchmarkMetric label="Token Speed" value={`${formatNumber(benchmark.tokens_per_second)} tok/s`} />
                <BenchmarkMetric label="First Token" value={benchmark.first_token_ms == null ? 'No token' : formatMs(benchmark.first_token_ms)} />
                <BenchmarkMetric label="Elapsed" value={formatMs(benchmark.elapsed_ms)} />
              </div>
              <div className="rounded-md border border-neutral-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium text-neutral-950">Remote Node</div>
                  <div className="truncate text-xs text-neutral-600" title={benchmark.node || nodeLabel(model)}>{benchmark.node || nodeLabel(model)}</div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs font-medium text-neutral-950">Generated Tokens</div>
                  <div className="text-xs text-neutral-600">{benchmark.generated_tokens.toLocaleString()}{benchmark.estimated ? ' estimated' : ''}</div>
                </div>
              </div>
              {benchmark.sample ? (
                <div className="rounded-md border border-neutral-200 p-3">
                  <div className="text-xs font-medium text-neutral-950">Sample</div>
                  <p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs leading-5 text-neutral-600">{benchmark.sample}</p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-100 bg-neutral-50 p-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            Close
          </button>
          <Tooltip content="Run the benchmark again on the runtime node.">
            <span className="inline-flex">
              <button
                type="button"
                onClick={onRun}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-md bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
                {loading ? 'Running...' : 'Run again'}
              </button>
            </span>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function BenchmarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-2 text-lg font-semibold tracking-tight text-neutral-950">{value}</div>
    </div>
  );
}

function modelKey(model: RuntimeModel) {
  return model.id && model.id !== 'unknown' ? model.id : model.docker_model || model.model;
}

function nodeLabel(model: RuntimeModel) {
  if (model.nodes.length > 0) return model.nodes.join(', ');
  return model.node || 'local';
}

function ownerLabel(model: RuntimeModel) {
  if (model.used_by.length > 0) return model.used_by.join(', ');
  if (model.manual) return 'Manual install';
  return 'Unowned';
}

function modelStatus(model: RuntimeModel) {
  if (model.orphaned) {
    return { label: 'Orphaned', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' };
  }
  if (model.compatibility?.status === 'warning') {
    return { label: 'Warning', className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' };
  }
  if (model.compatibility?.ok) {
    return { label: 'Ready', className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' };
  }
  if (model.manual) {
    return { label: 'Manual', className: 'bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200' };
  }
  return { label: 'Installed', className: 'bg-neutral-100 text-neutral-700 ring-1 ring-neutral-200' };
}

function formatMs(value: number) {
  if (value >= 1000) return `${formatNumber(value / 1000)}s`;
  return `${formatNumber(value)}ms`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: value >= 10 ? 1 : 2 }).format(value || 0);
}

function apiErrorMessage(error: unknown, fallback: string) {
  const responseData = error && typeof error === 'object' && 'response' in error
    ? (error as { response?: { data?: unknown } }).response?.data
    : null;

  if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
    const record = responseData as Record<string, unknown>;
    const detail = stringValue(record.detail) || stringValue(record.message) || stringValue(record.error);
    if (detail) return detail;
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}
