import { useCallback, useEffect, useMemo, useState } from 'react';
import { addClusterNode, fetchJobs, fetchSystemSummary, removeClusterNode } from '../api';
import type { Job, SystemSummary } from '../api';
import { Activity, Apple, BriefcaseBusiness, CircuitBoard, Cpu, Eye, EyeOff, Loader2, MemoryStick, Monitor, Plus, Server, Trash2 } from 'lucide-react';
import { confirmActionToast } from '../components/ui/confirm-toast';
import { Tooltip } from '../components/ui/tooltip';
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
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';

const activeStatuses = new Set(['running', 'pending', 'paused']);

export default function Dashboard() {
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [addNodeDialogOpen, setAddNodeDialogOpen] = useState(false);
  const [remoteNodeHost, setRemoteNodeHost] = useState('');
  const [remoteNodeToken, setRemoteNodeToken] = useState('');
  const [addingNode, setAddingNode] = useState(false);
  const [removingNodeName, setRemovingNodeName] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    const [summaryResult, jobsResult] = await Promise.allSettled([
      fetchSystemSummary(),
      fetchJobs(),
    ]);

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value);
    } else {
      console.error('Failed to load system summary', summaryResult.reason);
      setSummary({ nodes: [], jobs: [] });
    }

    if (jobsResult.status === 'fulfilled') {
      setJobs(jobsResult.value);
    } else {
      console.error('Failed to load jobs', jobsResult.reason);
      setJobs(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    const refreshTimer = window.setInterval(() => {
      void loadDashboard();
    }, 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadDashboard]);

  const handleAddClusterNode = async () => {
    const host = remoteNodeHost.trim();
    const token = remoteNodeToken.trim();
    if (!host || !token || addingNode) return;

    if (!isValidRemoteNodeHost(host) || !isValidRemoteNodeToken(token)) return;

    setAddNodeDialogOpen(false);
    confirmActionToast({
      id: `cluster-add-${host}`,
      title: 'Add this peer node?',
      description: `This box will connect to ${host} using the provided exposure token.`,
      confirmLabel: 'Add node',
      cancelLabel: 'Keep form open',
      onCancel: () => setAddNodeDialogOpen(true),
      loading: {
        title: 'Adding node',
        description: host,
      },
      success: (result: Awaited<ReturnType<typeof addClusterNode>>) => ({
        title: 'Node added',
        description: result.message || `${result.node_name || host} was added to this box.`,
      }),
      error: (error) => ({
        title: 'Add failed',
        description: apiErrorMessage(error, `Could not add ${host}.`),
      }),
      onConfirm: async () => {
        setAddingNode(true);
        try {
          const result = await addClusterNode({ host, token });
          await loadDashboard();
          setRemoteNodeHost('');
          setRemoteNodeToken('');
          setAddNodeDialogOpen(false);
          return result;
        } catch (error) {
          console.error('Failed to add cluster node', error);
          throw error;
        } finally {
          setAddingNode(false);
        }
      },
    });
  };

  const handleRemoveClusterNode = async (nodeName: string) => {
    if (!nodeName || nodeName === 'unknown' || removingNodeName) return;

    confirmActionToast({
      id: `cluster-remove-${nodeName}`,
      title: 'Remove this peer node?',
      description: `${nodeName} will be disconnected from this box and removed from the runtime resource list.`,
      confirmLabel: 'Remove node',
      cancelLabel: 'Keep node',
      loading: {
        title: 'Removing node',
        description: nodeName,
      },
      success: (result: Awaited<ReturnType<typeof removeClusterNode>>) => ({
        title: 'Node removed',
        description: result.message || `${nodeName} was removed from this box.`,
      }),
      error: (error) => ({
        title: 'Remove failed',
        description: apiErrorMessage(error, `Could not remove ${nodeName}.`),
      }),
      onConfirm: async () => {
        setRemovingNodeName(nodeName);
        try {
          const result = await removeClusterNode(nodeName);
          await loadDashboard();
          return result;
        } catch (error) {
          console.error('Failed to remove cluster node', error);
          throw error;
        } finally {
          setRemovingNodeName(null);
        }
      },
    });
  };

  const metricJobs = useMemo<Partial<Job>[]>(() => jobs ?? summary?.jobs ?? [], [jobs, summary]);

  const resources = useMemo(() => summarizeRuntimeResources(summary), [summary]);

  const totalJobs = metricJobs.length;
  const activeJobs = metricJobs.filter((job) => activeStatuses.has(job.status ?? '')).length;
  const clusterNodes = summary?.nodes.length || 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-6 h-7 w-20" />
              <Skeleton className="mt-6 h-4 w-44" />
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-5">
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <MetricCard
          icon={BriefcaseBusiness}
          label="Total Jobs"
          value={totalJobs.toLocaleString()}
          headline="All submitted workflow runs"
          detail={`${clusterNodes} cluster node${clusterNodes === 1 ? '' : 's'} connected`}
        />
        <MetricCard
          icon={Activity}
          label="Active Jobs"
          value={activeJobs.toLocaleString()}
          headline="Running, pending, or paused"
          detail={`${Math.max(totalJobs - activeJobs, 0)} terminal or idle jobs`}
        />
        <MetricCard
          icon={Cpu}
          label="CPU"
          value={resources.cpuCores ? `${resources.cpuCores.toLocaleString()} cores` : '0 cores'}
          headline={resources.cpuLoadRatio === null ? 'No CPU load reported' : `${formatPercent(resources.cpuLoadRatio)} load`}
          detail={`${resources.nodeCount} runtime node${resources.nodeCount === 1 ? '' : 's'} reporting`}
        />
        <MetricCard
          icon={MemoryStick}
          label="Memory"
          value={formatMemoryPair(resources.gpuMemoryTotalMb, resources.memoryTotalBytes)}
          headline="GPU mem / total mem"
          detail={resources.memoryUsedRatio === null ? 'No memory usage reported' : `${formatPercent(resources.memoryUsedRatio)} used`}
        />
        <MetricCard
          icon={CircuitBoard}
          label="GPU"
          value={`${resources.gpuCount.toLocaleString()} GPU${resources.gpuCount === 1 ? '' : 's'}`}
          headline={resources.gpuCount ? 'Runtime GPU devices' : 'No GPUs reported'}
          detail={`${resources.nodeCount} runtime node${resources.nodeCount === 1 ? '' : 's'} reporting`}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 border-b border-neutral-200 px-5 py-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-semibold tracking-tight text-neutral-950">Runtime Resources</h2>
            <p className="mt-1 text-xs text-neutral-500">Add exposed peer nodes to this box, or remove them from this box.</p>
          </div>
          <Tooltip content="Add a remote node exposed with mn node expose.">
            <Button
              type="button"
              size="sm"
              onClick={() => setAddNodeDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add node
            </Button>
          </Tooltip>
        </CardHeader>
        <CardContent className="divide-y divide-neutral-100 p-0">
          {(summary?.nodes || []).length === 0 ? (
            <div className="px-5 py-8 text-xs text-neutral-500">No cluster nodes reported yet.</div>
          ) : (
            summary?.nodes.map((node, index) => (
              <div key={`${node.name}-${index}`} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Server className="h-4 w-4 text-neutral-500" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-neutral-950">{node.name}</span>
                        {nodeIdentityBadges(node).map((badge) => (
                          <NodeIdentityBadge key={badge.id} badge={badge} />
                        ))}
                      </div>
                      <div className="text-xs text-neutral-500">{node.self ? 'Local node' : 'Peer node'}</div>
                    </div>
                  </div>
                  {!node.self ? (
                    <Tooltip content="Disconnect this peer node after confirmation.">
                      <span className="inline-flex">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveClusterNode(node.name)}
                          disabled={removingNodeName === node.name}
                        >
                          {removingNodeName === node.name ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Remove
                        </Button>
                      </span>
                    </Tooltip>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                  {nodeResourceMetrics(node).map((metric) => (
                    <NodeResourceMetric
                      key={metric.label}
                      detail={metric.detail}
                      label={metric.label}
                      value={metric.value}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AddClusterNodeDialog
        host={remoteNodeHost}
        adding={addingNode}
        onClose={() => {
          if (addingNode) return;
          setAddNodeDialogOpen(false);
          setRemoteNodeHost('');
          setRemoteNodeToken('');
        }}
        onHostChange={setRemoteNodeHost}
        onSubmit={handleAddClusterNode}
        onTokenChange={setRemoteNodeToken}
        open={addNodeDialogOpen}
        token={remoteNodeToken}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  headline,
  detail,
}: {
  icon: typeof BriefcaseBusiness;
  label: string;
  value: string;
  headline: string;
  detail: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-neutral-500">
        <span>{label}</span>
        <Icon className="h-4 w-4 text-neutral-500" />
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-neutral-950">{value}</div>
      <div className="mt-5 text-xs font-medium text-neutral-950">{headline}</div>
      <div className="mt-1 text-xs text-neutral-500">{detail}</div>
    </Card>
  );
}

function NodeResourceMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-neutral-200 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-neutral-950">{value}</div>
      <div className="mt-1 text-xs text-neutral-500">{detail}</div>
    </div>
  );
}

type IdentityBadge = {
  id: string;
  label: string;
  title: string;
  icon: typeof Server;
  gpuVendor?: 'nvidia' | 'amd' | 'intel' | 'mac';
};

function NodeIdentityBadge({ badge }: { badge: IdentityBadge }) {
  const Icon = badge.icon;
  const isGpuBadge = Boolean(badge.gpuVendor);
  return (
    <Tooltip content={badge.title}>
      <span
        className={cn(
          'inline-flex h-5 items-center justify-center rounded border border-neutral-200 bg-neutral-50 text-[11px] font-medium text-neutral-600',
          isGpuBadge ? 'w-5' : 'gap-1 px-1.5',
        )}
        aria-label={badge.title}
        title={badge.title}
      >
        {isGpuBadge ? <GpuBadgeIcon badge={badge} /> : (
          <>
            <Icon className="h-3 w-3" />
            {badge.label}
          </>
        )}
      </span>
    </Tooltip>
  );
}

function GpuBadgeIcon({ badge }: { badge: IdentityBadge }) {
  if (badge.gpuVendor === 'mac') return <Apple className="h-3 w-3" aria-hidden="true" />;

  const mark = badge.gpuVendor === 'nvidia'
    ? 'N'
    : badge.gpuVendor === 'amd'
      ? 'A'
      : badge.gpuVendor === 'intel'
        ? 'I'
        : '';

  return <span aria-hidden="true" className="text-[10px] leading-none">{mark}</span>;
}

function AddClusterNodeDialog({
  adding,
  host,
  onClose,
  onHostChange,
  onSubmit,
  onTokenChange,
  open,
  token,
}: {
  adding: boolean;
  host: string;
  onClose: () => void;
  onHostChange: (value: string) => void;
  onSubmit: () => void;
  onTokenChange: (value: string) => void;
  open: boolean;
  token: string;
}) {
  const [tokenVisible, setTokenVisible] = useState(false);
  if (!open) return null;

  const trimmedHost = host.trim();
  const trimmedToken = token.trim();
  const hostError = trimmedHost && !isValidRemoteNodeHost(trimmedHost)
    ? 'Use a host name or IP address without spaces.'
    : '';
  const tokenError = trimmedToken && !isValidRemoteNodeToken(trimmedToken)
    ? 'Paste the token from the remote node.'
    : '';
  const canSubmit = Boolean(trimmedHost && trimmedToken && !hostError && !tokenError && !adding);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !adding) onClose();
      }}
    >
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0" showClose={!adding}>
        <DialogHeader className="border-b border-neutral-100 p-4 pr-12">
          <div>
            <DialogTitle>Add Node to This Box</DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Add a remote node exposed with mn node expose.
            </DialogDescription>
          </div>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) onSubmit();
          }}
        >
          <div className="space-y-3 p-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-neutral-800">Remote host or IP</span>
              <Input
                value={host}
                onChange={(event) => onHostChange(event.target.value)}
                placeholder="192.168.1.42"
                autoComplete="off"
                autoFocus
                aria-invalid={Boolean(hostError)}
                aria-describedby={hostError ? 'remote-node-host-error' : undefined}
                className={cn(hostError ? 'border-red-400 focus-visible:ring-red-100' : '')}
              />
              {hostError ? (
                <span id="remote-node-host-error" className="text-xs text-red-600">{hostError}</span>
              ) : (
                <span className="text-xs text-neutral-500">Host reachable from this machine.</span>
              )}
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-neutral-800">Token</span>
              <div className="relative">
                <Input
                  value={token}
                  onChange={(event) => onTokenChange(event.target.value)}
                  placeholder="Token from mn node expose"
                  autoComplete="off"
                  aria-label="Token from mn node expose"
                  aria-invalid={Boolean(tokenError)}
                  aria-describedby={tokenError ? 'remote-node-token-error' : undefined}
                  type={tokenVisible ? 'text' : 'password'}
                  className={cn('pr-10', tokenError ? 'border-red-400 focus-visible:ring-red-100' : '')}
                />
                <Tooltip content={tokenVisible ? 'Hide the token value.' : 'Show the token value before adding.'}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setTokenVisible((current) => !current)}
                    className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2 text-neutral-500"
                    aria-label={tokenVisible ? 'Hide token' : 'Show token'}
                  >
                    {tokenVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </Tooltip>
              </div>
              {tokenError ? (
                <span id="remote-node-token-error" className="text-xs text-red-600">{tokenError}</span>
              ) : (
                <span className="text-xs text-neutral-500">Use the eye button to check the token before adding.</span>
              )}
            </label>
          </div>

          <DialogFooter className="border-t border-neutral-100 bg-neutral-50 p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={adding}
            >
              Cancel
            </Button>
            <Tooltip content="Review this node connection before adding it.">
              <span className="inline-flex">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!canSubmit}
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {adding ? 'Adding...' : 'Add node'}
                </Button>
              </span>
            </Tooltip>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function isValidRemoteNodeHost(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed)
    && trimmed.length <= 253
    && !trimmed.startsWith('-')
    && !/\s/.test(trimmed)
    && !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
}

function isValidRemoteNodeToken(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed.length <= 4096 && !/\s/.test(trimmed);
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

function summarizeRuntimeResources(summary: SystemSummary | null) {
  const nodes = summary?.nodes || [];
  let cpuCores = 0;
  let weightedLoad = 0;
  let loadWeight = 0;
  let memoryTotalBytes = 0;
  let memoryAvailableBytes = 0;
  let gpuCount = 0;
  let gpuMemoryTotalMb = 0;

  nodes.forEach((node) => {
    const hardware = recordValue(node.hardware);
    const cpu = recordValue(hardware.cpu);
    const memory = recordValue(hardware.memory);

    const logicalProcessors = numberValue(cpu.logical_processors);
    cpuCores += logicalProcessors;
    const loadRatio = numberValueOrNull(cpu.load_ratio);
    if (loadRatio !== null) {
      const weight = logicalProcessors || 1;
      weightedLoad += loadRatio * weight;
      loadWeight += weight;
    }

    memoryTotalBytes += numberValue(memory.total_bytes);
    memoryAvailableBytes += numberValue(memory.available_bytes);

    const gpuDevices = gpuDeviceRecords(recordValue(node));
    gpuCount += gpuDevices.length;
    gpuDevices.forEach((device) => {
      gpuMemoryTotalMb += numberValue(device.memory_total_mb);
    });
  });

  const memoryUsedBytes = Math.max(memoryTotalBytes - memoryAvailableBytes, 0);

  return {
    nodeCount: nodes.length,
    cpuCores,
    cpuLoadRatio: loadWeight > 0 ? weightedLoad / loadWeight : null,
    memoryTotalBytes,
    memoryAvailableBytes,
    memoryUsedRatio: memoryTotalBytes > 0 ? memoryUsedBytes / memoryTotalBytes : null,
    gpuCount,
    gpuMemoryTotalMb,
  };
}

function nodeResourceMetrics(node: SystemSummary['nodes'][number]) {
  const resources = summarizeRuntimeResources({ nodes: [node], jobs: [] });
  return [
    {
      label: 'CPU',
      value: resources.cpuCores ? `${resources.cpuCores.toLocaleString()} cores` : '0 cores',
      detail: resources.cpuLoadRatio === null ? 'No load reported' : `${formatPercent(resources.cpuLoadRatio)} load`,
    },
    {
      label: 'Memory',
      value: formatMemoryPair(resources.gpuMemoryTotalMb, resources.memoryTotalBytes),
      detail: 'GPU mem / total mem',
    },
    {
      label: 'GPU',
      value: `${resources.gpuCount.toLocaleString()} GPU${resources.gpuCount === 1 ? '' : 's'}`,
      detail: resources.gpuCount ? 'Runtime GPU devices' : 'No GPUs reported',
    },
  ];
}

function nodeIdentityBadges(node: SystemSummary['nodes'][number]): IdentityBadge[] {
  const osBadge = nodeOsBadge(node);
  const gpuBadges = gpuDeviceRecords(recordValue(node))
    .map(gpuIdentityBadge)
    .filter((badge): badge is IdentityBadge => Boolean(badge));

  return [osBadge, ...gpuBadges].filter((badge): badge is IdentityBadge => Boolean(badge));
}

function nodeOsBadge(node: SystemSummary['nodes'][number]): IdentityBadge | null {
  const nodeRecord = recordValue(node);
  const hardware = recordValue(nodeRecord.hardware);
  const platform = { ...recordValue(hardware.platform), ...recordValue(nodeRecord.platform) };
  const os = [
    stringValue(platform.os),
    stringValue(platform.family),
    stringValue(platform.display_name),
  ].join(' ').toLowerCase();

  if (os.includes('darwin') || os.includes('mac')) {
    return { id: 'os-macos', label: 'macOS', title: 'macOS node', icon: Apple };
  }
  if (os.includes('win')) {
    return { id: 'os-windows', label: 'Windows', title: 'Windows node', icon: Monitor };
  }
  if (os.includes('linux')) {
    return { id: 'os-linux', label: 'Linux', title: 'Linux node', icon: Server };
  }

  return null;
}

function gpuDeviceRecords(source: Record<string, unknown>) {
  const hardware = recordValue(source.hardware);
  const devices = [...arrayRecords(source.devices), ...arrayRecords(hardware.devices)];
  const gpuDevices = devices
    .map(recordValue)
    .filter((device) => stringValue(device.kind).toLowerCase() === 'gpu' || stringValue(device.type).toLowerCase().includes('gpu'));
  if (gpuDevices.length > 0) return uniqueDeviceRecords(gpuDevices);

  const gpu = Object.keys(hardware).length > 0 ? hardware.gpu : source.gpu;
  if (Array.isArray(gpu)) return gpu.map(recordValue);
  if (gpu && typeof gpu === 'object' && !Array.isArray(gpu)) return [recordValue(gpu)];
  return [];
}

function uniqueDeviceRecords(devices: Record<string, unknown>[]) {
  const seen = new Set<string>();
  return devices.filter((device, index) => {
    const key = stringValue(device.id) || stringValue(device.uuid) || stringValue(device.name) || `gpu-${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function arrayRecords(value: unknown) {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function gpuIdentityBadge(device: Record<string, unknown>): IdentityBadge | null {
  const vendor = gpuVendorKey(device);
  if (!vendor) return null;
  const title = gpuDisplayName(device);
  return {
    id: `gpu-${vendor}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label: title,
    title,
    icon: vendor === 'mac' ? Apple : CircuitBoard,
    gpuVendor: vendor,
  };
}

function gpuVendorKey(device: Record<string, unknown>): IdentityBadge['gpuVendor'] | null {
  const text = gpuSearchText(device);
  if (text.includes('apple') || text.includes('metal') || text.includes('mac-metal')) return 'mac';
  if (text.includes('nvidia') || text.includes('cuda')) return 'nvidia';
  if (text.includes('amd') || text.includes('radeon') || text.includes('rocm')) return 'amd';
  if (text.includes('intel')) return 'intel';
  return null;
}

function gpuDisplayName(device: Record<string, unknown>) {
  const text = gpuSearchText(device);
  const gpuType = stringValue(device.gpu_type).toLowerCase();
  const apiVersion = stringValue(device.api_version) || versionFromGpuType(gpuType);

  if (text.includes('apple') || text.includes('metal') || gpuType === 'mac-metal') return 'Mac Metal';
  if (text.includes('nvidia') || text.includes('cuda')) return `NVIDIA CUDA${apiVersion ? ` ${apiVersion}` : ''}`;
  if (text.includes('amd') || text.includes('radeon') || text.includes('rocm')) return `AMD ROCm${apiVersion ? ` ${apiVersion}` : ''}`;
  if (text.includes('intel')) return 'Intel GPU';
  return 'GPU';
}

function gpuSearchText(device: Record<string, unknown>) {
  const capabilities = Array.isArray(device.capabilities) ? device.capabilities.map(stringValue).join(' ') : '';
  return [
    stringValue(device.gpu_type),
    stringValue(device.vendor),
    stringValue(device.type),
    stringValue(device.driver),
    stringValue(device.api),
    stringValue(device.name),
    capabilities,
  ].join(' ').toLowerCase();
}

function versionFromGpuType(gpuType: string) {
  const match = gpuType.match(/(?:nvidia-cuda|amd-rocm)-(.+)$/);
  return match?.[1] || '';
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function numberValueOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatMemoryPair(gpuMemoryTotalMb: number, memoryTotalBytes: number) {
  const gpuGb = gpuMemoryTotalMb / 1024;
  const totalGb = memoryTotalBytes / (1024 * 1024 * 1024);
  return `${formatGbAmount(gpuGb)} / ${formatGbAmount(totalGb)} GB`;
}

function formatGbAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const precision = value >= 10 ? 0 : 1;
  return value.toFixed(precision);
}

function formatPercent(value: number) {
  return `${Math.round(Math.max(value, 0) * 100)}%`;
}
