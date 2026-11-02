import { z } from 'zod';
import type { RuntimeSignal } from '../api/runtimeSignals';

const incident = z.object({
  incident_id: z.string(),
  state: z.enum(['observed', 'retrying', 'recovered', 'terminal']),
  count: z.number().optional(),
  error: z.object({ code: z.string(), desc: z.string() }),
});
const response = z.object({ command_id: z.string(), status: z.string() });

export function RuntimeSignalsPanel({ events = [], unavailable }: {
  events?: RuntimeSignal[]; unavailable?: string | null;
}) {
  return <div aria-label="Runtime notifications" aria-live="polite">
    {unavailable && <p role="status" className="my-2 rounded border border-amber-300 p-2 text-xs">{unavailable} Operation status is unchanged.</p>}
    {events.slice(-100).reverse().map(event => {
      if (event.channel === 'errors') {
        const parsed = incident.safeParse(event.payload);
        if (!parsed.success) return null;
        const item = parsed.data;
        return <p key={item.incident_id} role="status" className="my-2 rounded border border-neutral-300 p-2 text-xs">
          <strong>{item.state === 'recovered' ? 'Recovered' : item.state === 'terminal' ? 'Attempt failed' : 'Failure detected'}</strong>
          {`: ${item.error.desc}`} {item.count && item.count > 1 ? `(${item.count} occurrences)` : ''}
          {item.state === 'observed' || item.state === 'retrying' ? ' — Recovery is being evaluated.' : ''}
        </p>;
      }
      const parsed = response.safeParse(event.payload);
      return parsed.success ? <p key={parsed.data.command_id} className="my-1 text-xs text-neutral-600">
        Command {parsed.data.command_id}: {parsed.data.status}
      </p> : null;
    })}
    {events.length > 100 && <p className="text-xs text-neutral-500">Showing the latest 100 notifications. Earlier results remain available from runtime status.</p>}
  </div>;
}
