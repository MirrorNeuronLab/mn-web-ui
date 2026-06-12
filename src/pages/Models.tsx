import { useCallback, useEffect, useMemo, useState } from 'react';
import { Boxes, Gauge, Loader2, RefreshCw, Server } from 'lucide-react';
import { benchmarkRuntimeModel, fetchRuntimeModels } from '../api';
import type { RuntimeModel, RuntimeModelBenchmark, RuntimeModelListResponse } from '../api';
import { Tooltip } from '../components/ui/tooltip';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Skeleton } from '../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';

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
      <Card>
        <CardContent className="p-5">
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-end gap-3 space-y-0 border-b border-neutral-200 px-5 py-4">
          <Tooltip content="Refresh installed model status.">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadModels()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </Tooltip>
        </CardHeader>

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
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[640px] table-fixed text-xs">
              <TableHeader className="bg-neutral-50 text-neutral-500">
                <TableRow>
                  <TableHead className="w-56 max-w-56 px-5 py-3">Model</TableHead>
                  <TableHead className="px-4 py-3">Node</TableHead>
                  <TableHead className="px-4 py-3">Used By</TableHead>
                  <TableHead className="w-36 px-4 py-3">Status</TableHead>
                  <TableHead className="w-20 px-5 py-3 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((model) => {
                  const status = modelStatus(model);
                  const canBenchmark = model.provider === 'docker_model_runner';
                  const displayName = modelDisplayName(model);
                  const node = nodeLabel(model);
                  const owner = ownerLabel(model);
                  return (
                    <TableRow key={`${model.id}-${model.docker_model}`} className="align-top">
                      <TableCell className="w-56 max-w-56 px-5 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <Boxes className="h-4 w-4 shrink-0 text-neutral-500" />
                          <Tooltip content={displayName}>
                            <span className="block min-w-0 flex-1 truncate font-medium text-neutral-950">
                              {displayName}
                            </span>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        <div className="flex min-w-0 items-center gap-2 text-neutral-700">
                          <Server className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
                          <Tooltip content={node}>
                            <span className="block min-w-0 flex-1 truncate">{node}</span>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 text-neutral-700">
                        <Tooltip content={owner}>
                          <span className="line-clamp-2 min-w-0">{owner}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="w-36 px-4 py-4">
                        <Badge variant="outline" className={`${status.className} whitespace-nowrap`}>
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="w-20 px-5 py-4 text-right">
                        <Tooltip content={canBenchmark ? 'Benchmark this model from the runtime node.' : 'Benchmark is only available for Docker Model Runner chat models.'}>
                          <span className="inline-flex">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={`Benchmark ${displayName}`}
                              onClick={() => openBenchmark(model)}
                              disabled={!canBenchmark}
                            >
                              <Gauge className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

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
    <Dialog
      open={Boolean(model)}
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0" showClose={!loading}>
        <DialogHeader className="border-b border-neutral-100 p-4 pr-12">
          <div className="min-w-0">
            <DialogTitle>Benchmark Model</DialogTitle>
            <DialogDescription className="mt-1 break-all font-mono text-[11px]">
              {model.docker_model || model.model}
            </DialogDescription>
          </div>
        </DialogHeader>

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

        <DialogFooter className="border-t border-neutral-100 bg-neutral-50 p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={loading}
          >
            Close
          </Button>
          <Tooltip content="Run the benchmark again on the runtime node.">
            <span className="inline-flex">
              <Button
                type="button"
                size="sm"
                onClick={onRun}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gauge className="h-4 w-4" />}
                {loading ? 'Running...' : 'Run again'}
              </Button>
            </span>
          </Tooltip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function modelDisplayName(model: RuntimeModel) {
  return model.name || model.id || model.docker_model || model.model || 'Unknown model';
}

function nodeLabel(model: RuntimeModel) {
  if (model.nodes.length > 0) return model.nodes.join(', ');
  return model.node || 'local';
}

function ownerLabel(model: RuntimeModel) {
  if (model.used_by.length > 0) return model.used_by.join(', ');
  if (model.manual) return 'Manual install';
  return 'Runtime';
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
