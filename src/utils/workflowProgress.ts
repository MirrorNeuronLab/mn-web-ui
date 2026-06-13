export const formatElapsed = (seconds?: number) => {
  const value = Number(seconds || 0);
  if (!Number.isFinite(value) || value <= 0) return '0s';
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
  return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
};
