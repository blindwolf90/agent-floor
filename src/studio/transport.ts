// Studio action transport.
// Default (?studio): controlled transport to the local MSOS bridge (http://127.0.0.1:4318, override with ?bridge=).
//   POST /actions carries the intent only; results arrive as bridge events on GET /studio/events (SSE).
// Kimi's local dry-run handler stays for ?simulate and ?capture (UI evidence runs), and never touches the network.
import type { StudioEvent, StudioRealState } from './state';

export type StudioActionPayload = {
  action: 'claim_request' | 'review';
  agent?: string;
  task_id?: string;
  result?: string;
  note?: string;
  ts: number;
};

const params = new URLSearchParams(location.search);
export const BRIDGE = (params.get('bridge') || 'http://127.0.0.1:4318').replace(/\/$/, '');
export const useBridge = !params.has('simulate') && !params.has('capture');

export const dryRunActionRequests: StudioActionPayload[] = [];

export async function postStudioAction(payload: StudioActionPayload): Promise<Response> {
  if (useBridge) {
    const res = await fetch(BRIDGE + '/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (res.status !== 202) throw new Error('bridge refused: ' + res.status);
    return res;
  }
  const request = new Request('/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return localActionHandler(request);
}

/** Bridge events → studio state. EventSource reconnects by itself; the bridge replays current state on connect. */
export function subscribeBridge(dispatch: (event: StudioEvent) => void, onConnection: (connected: boolean) => void): EventSource {
  const es = new EventSource(BRIDGE + '/studio/events');
  es.onopen = () => onConnection(true);
  es.onerror = () => onConnection(false);
  es.onmessage = (e) => {
    onConnection(true);
    try { dispatch(JSON.parse(e.data)); } catch { /* ignore malformed frames */ }
  };
  return es;
}

export async function fetchStudioState(): Promise<{ mode?: string; real?: StudioRealState | null }> {
  const response = await fetch(BRIDGE + '/studio/state', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('bridge state unavailable: ' + response.status);
  return response.json();
}

async function localActionHandler(request: Request): Promise<Response> {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/actions') {
    return Response.json({ error: '模拟｜未知动作入口' }, { status: 404 });
  }
  const body = await request.json() as StudioActionPayload;
  dryRunActionRequests.push(body);
  return Response.json({ accepted: true, mode: '模拟模式', pending: true }, { status: 202 });
}
