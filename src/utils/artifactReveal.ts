import { toast } from 'sonner';
import { revealArtifact } from '../api';

export const openArtifactLocation = (revealUrl: string | undefined, label: string) => {
  if (!revealUrl) return;
  void revealArtifact(revealUrl)
    .then(() => toast.message('Opened file location', { description: label }))
    .catch(() => toast.error('Could not open file location', { description: label }));
};
