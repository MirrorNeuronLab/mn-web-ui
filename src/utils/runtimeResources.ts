import { Apple, CircuitBoard, Monitor, Server } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SystemSummary } from '../api';

export type IdentityBadge = {
  id: string;
  label: string;
  title: string;
  icon: LucideIcon;
  gpuVendor?: 'nvidia' | 'amd' | 'intel' | 'mac';
};

export function summarizeRuntimeResources(summary: SystemSummary | null) {
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

export function nodeResourceMetrics(node: SystemSummary['nodes'][number]) {
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

export function nodeIdentityBadges(node: SystemSummary['nodes'][number]): IdentityBadge[] {
  const osBadge = nodeOsBadge(node);
  const gpuBadges = gpuDeviceRecords(recordValue(node))
    .map(gpuIdentityBadge)
    .filter((badge): badge is IdentityBadge => Boolean(badge));

  return [osBadge, ...gpuBadges].filter((badge): badge is IdentityBadge => Boolean(badge));
}

export function nodeProfileTitle(node: SystemSummary['nodes'][number]) {
  const parts = [];
  const cpuModel = nodeCpuModel(node);
  const gpuModels = nodeGpuModels(node);

  if (cpuModel) parts.push(`CPU: ${cpuModel}`);
  if (gpuModels.length > 0) parts.push(`GPU: ${gpuModels.join(', ')}`);

  return parts.length > 0 ? parts.join(' | ') : 'Runtime node';
}

function nodeCpuModel(node: SystemSummary['nodes'][number]) {
  const nodeRecord = recordValue(node);
  const hardware = recordValue(nodeRecord.hardware);
  const cpu = { ...recordValue(hardware.cpu), ...recordValue(nodeRecord.cpu) };

  return stringValue(nodeRecord.cpu_model)
    || stringValue(cpu.model)
    || stringValue(cpu.model_name)
    || stringValue(cpu.brand)
    || stringValue(cpu.processor);
}

function nodeGpuModels(node: SystemSummary['nodes'][number]) {
  const nodeRecord = recordValue(node);
  const explicitModels = arrayStrings(nodeRecord.gpu_models);
  const explicitModel = stringValue(nodeRecord.gpu_model);
  const deviceModels = gpuDeviceRecords(nodeRecord).map((device) => (
    stringValue(device.model) || stringValue(device.name)
  ));

  return [...explicitModels, explicitModel, ...deviceModels]
    .map((model) => model.trim())
    .filter((model) => model && !isUnknownGpu(model))
    .filter((model, index, models) => models.indexOf(model) === index);
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

function arrayStrings(value: unknown) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function gpuIdentityBadge(device: Record<string, unknown>): IdentityBadge | null {
  const vendor = gpuVendorKey(device);
  if (!vendor) return null;
  const title = gpuDisplayName(device);
  return {
    id: `gpu-${vendor}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label: gpuBadgeLabel(vendor),
    title,
    icon: vendor === 'mac' ? Apple : CircuitBoard,
    gpuVendor: vendor,
  };
}

function gpuBadgeLabel(vendor: IdentityBadge['gpuVendor']) {
  if (vendor === 'mac') return 'Apple Metal';
  if (vendor === 'nvidia') return 'NVIDIA';
  if (vendor === 'amd') return 'AMD';
  if (vendor === 'intel') return 'Intel';
  return 'GPU';
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

  if (text.includes('apple') || text.includes('metal') || gpuType === 'mac-metal') return 'Apple Metal';
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

function isUnknownGpu(value: string) {
  const text = value.toLowerCase();
  return ['unknown', 'none', 'unsupported', 'not available'].some((marker) => text.includes(marker));
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function numberValueOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function formatMemoryPair(gpuMemoryTotalMb: number, memoryTotalBytes: number) {
  const gpuGb = gpuMemoryTotalMb / 1024;
  const totalGb = memoryTotalBytes / (1024 * 1024 * 1024);
  return `${formatGbAmount(gpuGb)} / ${formatGbAmount(totalGb)} GB`;
}

function formatGbAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const precision = value >= 10 ? 0 : 1;
  return value.toFixed(precision);
}

export function formatPercent(value: number) {
  return `${Math.round(Math.max(value, 0) * 100)}%`;
}
