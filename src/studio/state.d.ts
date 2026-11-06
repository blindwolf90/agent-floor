export type StudioEventType = 'status' | 'claim_confirmed' | 'claim_rejected' | 'blocked' | 'report_ready' | 'review_result' | 'bridge_status';
export interface StudioEvent { type: StudioEventType; agent?: string; task_id?: string; task_title?: string; source?: string; reason?: string; report_url?: string; report_local?: string; summary?: string; result?: string; note?: string; mode?: string; connected?: boolean; last_update_ts?: number; status?: string; activity?: string; ts?: number }
export interface StudioAction { action: 'claim_request' | 'review'; agent?: string; task_id?: string; result?: string; note?: string; ts: number }
export interface StudioReport { taskId: string; status: 'ready' | 'rejected'; summary: string; reportUrl: string | null; reportLocal: string | null; note: string }
export interface StudioScheduleItem { name: string; owner: string; time: string; source: string; lastResult: string; control: string }
export interface StudioScheduleBoard { updatedAt?: string; items?: StudioScheduleItem[] }
export interface StudioRealTicket { id: string; title: string; status: string; deadline: string; url: string | null }
export interface StudioRealState { ok: boolean | null; working: StudioRealTicket[]; claimable: StudioRealTicket[]; error: string | null }
export interface StudioState {
  bridge: { received: boolean; connection: 'unknown' | 'connected' | 'disconnected'; mode: string; connected: boolean | null; lastUpdateTs: number | null; note: string };
  engineer: { taskId: string | null; taskTitle: string; blocked: { taskId: string; reason: string } | null; claimPending: boolean; lastRejection: string | null };
  kimi: { status: '尚未接通' };
  schedule: { loaded: boolean; updatedAt: string | null; items: StudioScheduleItem[] };
  real: StudioRealState;
  reports: Record<string, StudioReport>; reportOrder: string[]; reviewPending: Record<string, { result: string; note: string }>; notice: string; actions: StudioAction[];
}
export function createStudioState(): StudioState;
export function applyStudioEvent(state: StudioState, ev: StudioEvent): StudioState;
export function setStudioSchedule(state: StudioState, board: StudioScheduleBoard | null): StudioState;
export function setStudioReal(state: StudioState, real: Partial<StudioRealState> | null): StudioState;
export function setStudioBridgeConnection(state: StudioState, connected: boolean): StudioState;
export function realWorkView(state: StudioState): { kind: 'mode' | 'error' | 'loading' | 'ready'; text: string };
export function beginStudioAction(state: StudioState, payload: Omit<StudioAction, 'ts'> & { ts?: number }): StudioAction;
export function latestReport(state: StudioState): StudioReport | null;
export function bridgeView(state: StudioState, now?: number): { text: string; title: string; stale: boolean; note: string };
export class StudioStore {
  state: StudioState;
  constructor();
  subscribe(fn: () => void): () => boolean;
  onEvent(fn: (ev: StudioEvent) => void): () => boolean;
  apply(ev: StudioEvent): void;
  emit(): void;
  beginAction(payload: Omit<StudioAction, 'ts'> & { ts?: number }): StudioAction;
  setSchedule(board: StudioScheduleBoard | null): void;
  setReal(real: Partial<StudioRealState> | null): void;
  setBridgeConnection(connected: boolean): void;
}
