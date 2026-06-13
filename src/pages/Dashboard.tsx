import { useCallback, useMemo, useState } from 'react';
import { fetchJobs, fetchSystemSummary } from '../api';
import type { Job, SystemSummary } from '../api';
import { Activity, BriefcaseBusiness, CircuitBoard, Cpu, MemoryStick, Server } from 'lucide-react';
import { Tooltip } from '../components/ui/tooltip';
import { Card, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { usePollingEffect } from '../hooks/usePollingEffect';
import { cn } from '../lib/utils';
import { isActiveJobStatus } from '../utils/jobStatus';
import {
  formatMemoryPair,
  formatPercent,
  nodeIdentityBadges,
  nodeProfileTitle,
  nodeResourceMetrics,
  summarizeRuntimeResources,
  type IdentityBadge,
} from '../utils/runtimeResources';

export default function Dashboard() {
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loading, setLoading] = useState(true);

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

  usePollingEffect(loadDashboard, { intervalMs: 5000 });

  const metricJobs = useMemo<Partial<Job>[]>(() => jobs ?? summary?.jobs ?? [], [jobs, summary]);

  const resources = useMemo(() => summarizeRuntimeResources(summary), [summary]);

  const totalJobs = metricJobs.length;
  const activeJobs = metricJobs.filter((job) => isActiveJobStatus(job.status)).length;
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
        <CardContent className="divide-y divide-neutral-100 p-0">
          {(summary?.nodes || []).length === 0 ? (
            <div className="px-5 py-8 text-xs text-neutral-500">No cluster nodes reported yet.</div>
          ) : (
            summary?.nodes.map((node, index) => (
              <div key={`${node.name}-${index}`} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Tooltip content={nodeProfileTitle(node)}>
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center"
                        aria-label={nodeProfileTitle(node)}
                        title={nodeProfileTitle(node)}
                      >
                        <Server className="h-4 w-4 text-neutral-500" />
                      </span>
                    </Tooltip>
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

function NodeIdentityBadge({ badge }: { badge: IdentityBadge }) {
  const Icon = badge.icon;
  const isGpuBadge = Boolean(badge.gpuVendor);
  return (
    <Tooltip content={badge.title}>
      <span
        className={cn(
          'inline-flex h-5 items-center justify-center rounded border border-neutral-200 bg-neutral-50 text-[11px] font-medium text-neutral-600',
          'gap-1 px-1.5',
        )}
        aria-label={badge.title}
        title={badge.title}
      >
        {isGpuBadge ? badge.label : (
          <>
            <Icon className="h-3 w-3" />
            {badge.label}
          </>
        )}
      </span>
    </Tooltip>
  );
}
