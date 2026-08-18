import { supabase } from '@/app/lib/supabase';

const TECH_GRAPH_BASE = (
  import.meta.env.VITE_TECHNICAL_GRAPH_URL || 'http://127.0.0.1:8787'
).replace(/\/$/, '');

async function withAuth(init?: RequestInit): Promise<RequestInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return init ?? {};
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

async function techGraphJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(
    `${TECH_GRAPH_BASE}${path}`,
    await withAuth({ ...init, headers }),
  );
  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }
  if (!response.ok) {
    throw new Error(
      typeof payload === 'object' && payload
        ? JSON.stringify(payload)
        : `${response.status} ${text}`,
    );
  }
  return payload as T;
}

export type TechnicalGraphView =
  | 'subsystem_review'
  | 'question_gate'
  | 'graph_segment_plan_editor'
  | 'graph_segment_context_viewer'
  | 'circuit_segment_review'
  | 'graph_segment_queue'
  | 'final_graph_review'
  | 'status_view'
  | string;

export interface TechnicalGraphAction {
  id: string;
  label: string;
  description?: string | null;
  method?: string;
  endpoint?: string;
  payload_template?: Array<{
    path: string;
    value_placeholder: string;
    description?: string | null;
  }>;
}

export interface TechnicalGraphUiResponse {
  run_id: string;
  design_id?: string | null;
  fixture_key?: string | null;
  phase: string;
  status: string;
  view: TechnicalGraphView;
  data: Record<string, unknown>;
  editable_fields?: unknown[];
  actions: TechnicalGraphAction[];
  /** True when the response was served from the local response cache (TGA_CACHE_FILE). */
  _cached?: boolean;
}

export interface StartTechnicalGraphRunRequest {
  design_id: string;
  auto_plan_subsystems?: boolean;
  objective?: string;
}

export interface TechnicalGraphActionRequest {
  action: string;
  graph_segment_id?: string | null;
  work_package_id?: string | null;
  changes?: unknown[];
  answers?: unknown[];
  draft_delta?: Record<string, unknown> | null;
  reason?: string | null;
}

export function startTechnicalGraphRun(
  body: StartTechnicalGraphRunRequest,
): Promise<TechnicalGraphUiResponse> {
  return techGraphJSON('/technical-graph/runs', {
    method: 'POST',
    body: JSON.stringify({
      auto_plan_subsystems: true,
      ...body,
    }),
  });
}

export function getTechnicalGraphRun(runId: string): Promise<TechnicalGraphUiResponse> {
  return techGraphJSON(`/technical-graph/runs/${encodeURIComponent(runId)}`);
}

export function postTechnicalGraphAction(
  runId: string,
  body: TechnicalGraphActionRequest,
): Promise<TechnicalGraphUiResponse> {
  return techGraphJSON(`/technical-graph/runs/${encodeURIComponent(runId)}/actions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getTechnicalGraphFinal(runId: string): Promise<TechnicalGraphUiResponse> {
  return techGraphJSON(`/technical-graph/runs/${encodeURIComponent(runId)}/graph`);
}

export { TECH_GRAPH_BASE };
