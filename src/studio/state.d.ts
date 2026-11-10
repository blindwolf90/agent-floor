export type StudioMode = 'dry-run' | 'notion-read' | 'claim-test' | 'live';
export type StudioEventType = 'status' | 'claim_confirmed' | 'claim_rejected' | 'blocked' | 'report_ready' | 'review_result' | 'bridge_status';
export interface StudioEvent { type: StudioEventType; agent?: string; task_id?: string; task_title?: string; source?: string; reason?: string; report_url?: string; report_local?: string; summary?: string; result?: string; note?: string; mode?: string; connected?: boolean; last_update_ts?: number; status?: string; activity?: string; ts?: number }
export interface StudioAction { action: 'claim_request' | 'review'; agent?: string; task_id?: string; result?: string; note?: string; ts: number }
export interface StudioReport { taskId: string; status: 'ready' | 'rejected'; summary: string; reportUrl: string | null; reportLocal: string | null; note: string }
export interface StudioScheduleItem { name: string; owner: string; time: string; updatedAt?: string; source: string; lastResult: string; control: string }
export interface StudioScheduleBoard { updatedAt?: string; source?: string; items?: StudioScheduleItem[] }
export interface StudioRealTicket { id: string; title: string; status: string; deadline: string; url: string | null }
export interface StudioRealCounts { total: number | null; open: number | null; claimable: number | null; working: number | null; blocked: number | null; review: number | null }
export interface StudioRealState { ok: boolean | null; working: StudioRealTicket[]; claimable: StudioRealTicket[]; counts: StudioRealCounts; error: string | null }
export interface StudioState {
  bridge: { received: boolean; connection: 'unknown' | 'connected' | 'disconnected'; mode: string; connected: boolean | null; lastUpdateTs: number | null; note: string };
  engineer: { taskId: string | null; taskTitle: string; blocked: { taskId: string; reason: string } | null; claimPending: boolean; lastRejection: string | null };
  kimi: { status: '尚未接通' };
  schedule: { loaded: boolean; updatedAt: string | null; simulated: boolean; items: StudioScheduleItem[] };
  real: StudioRealState;
  reports: Record<string, StudioReport>; reportOrder: string[]; reviewPending: Record<string, { result: string; note: string }>; notice: string; actions: StudioAction[];
}
export interface StudioModeView { mode: StudioMode | null; subtitle: string; engineerIdle: string; coo: string; kimi: string; launcher: string; claim: string; notice: string; reason: string; prefix: string; claimable: boolean }
export function createStudioState(): StudioState;
export function applyStudioEvent(state: StudioState, ev: StudioEvent): StudioState;
export function studioModeView(state: StudioState): StudioModeView;
export function studioModeText(state: StudioState, value: string): string;
export function setStudioSchedule(state: StudioState, board: StudioScheduleBoard | null): StudioState;
export function setStudioReal(state: StudioState, real: Partial<StudioRealState> | null): StudioState;
export function setStudioMode(state: StudioState, mode: string): StudioState;
export function setStudioBridgeConnection(state: StudioState, connected: boolean): StudioState;
export function realWorkView(state: StudioState): { kind: 'mode' | 'error' | 'loading' | 'ready'; text: string };
export function realCountsView(counts: StudioRealCounts): string;
export function realWorkGroups(state: StudioState): { key: string; label: string; items: StudioRealTicket[] }[];
export function realGroupEmptyText(group: string, items: StudioRealTicket[]): string;
export function canStudioClaim(state: StudioState): boolean;
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
  setMode(mode: string): void;
  setBridgeConnection(connected: boolean): void;
}
