export type ArtifactLike = {
  artifact_id?: string;
  relative_path?: string;
  path?: string;
  url?: string;
  reveal_url?: string;
  label?: string;
  title?: string;
  name?: string;
};

const fileNameFromPath = (value: string): string => {
  const normalized = value.trim().replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || normalized;
};

const artifactIdToFileName = (artifactId: string): string => {
  const rotated = artifactId.match(/^(events|logs|errors)_jsonl_(\d+)$/);
  if (rotated) return `${rotated[1]}.${rotated[2]}.jsonl`;
  const suffixes = ['jsonl', 'json', 'log', 'md', 'pdf', 'txt', 'gz'];
  for (const suffix of suffixes) {
    const marker = `_${suffix}`;
    if (artifactId.endsWith(marker)) {
      return `${artifactId.slice(0, -marker.length)}.${suffix}`;
    }
  }
  return artifactId;
};

const firstText = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
};

export const artifactDisplayName = (artifact?: ArtifactLike | null, fallback = 'artifact'): string => {
  const label = firstText(artifact?.label, artifact?.title, artifact?.name);
  if (label) return label;
  const relativePath = firstText(artifact?.relative_path);
  if (relativePath) return relativePath;
  const artifactId = firstText(artifact?.artifact_id);
  if (artifactId) return artifactIdToFileName(artifactId);
  const path = firstText(artifact?.path, artifact?.url);
  if (path) return fileNameFromPath(path);
  return fallback;
};

export const isOpenableHref = (value: string | undefined): value is string => (
  typeof value === 'string' && /^(https?:\/\/|\/)/i.test(value.trim())
);
