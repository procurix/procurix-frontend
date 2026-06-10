const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8090/api';
const API_DEBUG = import.meta.env.DEV;

function encodeMpn(mpn: string): string {
    return mpn.split('/').map(encodeURIComponent).join('/');
}

// Verbose fetch wrapper
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
    const method = init?.method ?? 'GET';
    const t0 = performance.now();

    if (API_DEBUG) {
        let bodyPreview = '';
        if (init?.body) {
            if (typeof init.body === 'string') bodyPreview = init.body.slice(0, 300);
            else if (init.body instanceof FormData) bodyPreview = '[FormData]';
            else bodyPreview = '[binary]';
        }
        console.log(`%c>> ${method} ${url}`, 'color:#4ade80;font-weight:bold', bodyPreview || '');
    }

    const response = await fetch(url, init);
    if (API_DEBUG) {
        const elapsed = (performance.now() - t0).toFixed(0);
        const color = response.ok ? '#4ade80' : '#f87171';

        response.clone().json().then(data => {
            console.log(`%c<< ${response.status} ${method} ${url}  (${elapsed}ms)`, `color:${color};font-weight:bold`, data);
        }).catch(() => {
            console.log(`%c<< ${response.status} ${method} ${url}  (${elapsed}ms)`, `color:${color};font-weight:bold`);
        });
    }

    return response;
}

async function apiJSON<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await apiFetch(url, init);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text}`);
    }
    return res.json();
}

export type EffectKind = 'hard_delete' | 'flag' | 'unlink_and_flag' | 'no_change';

export interface ImpactItem {
    entity_type: string;
    entity_id: string;
    label: string;
    parent_context: string | null;
    current_state: string;
    predicted_effect: EffectKind;
    effect_detail: string;
    blocking: boolean;
}

export interface ImpactReport {
    action: string;
    target: { type: string; id: string; label: string };
    downstream: ImpactItem[];
    summary: {
        total_affected: number;
        by_entity_type: Record<string, number>;
        by_predicted_effect: Record<string, number>;
        by_context: Record<string, number>;
        has_blockers: boolean;
        is_empty: boolean;
    };
}

export async function previewImpact(
    designId: string,
    payload: { action: string; target: Record<string, unknown> },
): Promise<ImpactReport> {
    return apiJSON(`${BASE_URL}/designs/${designId}/impact/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

// Core types

export interface Design {
    id: string;
    project_name: string | null;
    user_id: string | null;
    fsm_state: string;
    current_stage: number;
    workflow_status: string;
    created_at: string;
}

export interface DesignPart {
    id: string;
    mpn: string | null;
    selected_mpn: string | null;
    manufacturer: string | null;
    quantity: number;
    designator: string | null;
    component_id: string | null;
    instance_index: number;
    identification_status: string | null;
    classification: string | null;
    category: string | null;
    suggestions_json: Record<string, unknown> | null;
    raw_context?: {
        raw?: Record<string, string | null | undefined>;
        value?: string | null;
        description?: string | null;
        footprint?: string | null;
        distributor?: string | null;
        distributor_part_number?: string | null;
    } | null;
}

export interface UploadResponse {
    design_id: string;
    fsm_state: string;
    part_count: number;
    parts_count: number;
    total_quantity?: number;
    columns?: string[];
    rows_preview?: Record<string, unknown>[];
    parts_preview?: Array<{
        mpn?: string | null;
        part_number?: string | null;
        manufacturer?: string | null;
        quantity?: number | null;
        designator?: string | null;
    }>;
    message: string;
}

export interface BomColumnMapping {
    mpn: string | null;
    manufacturer: string | null;
    quantity: string | null;
    designator: string | null;
}

export interface BomPreviewResponse {
    columns: string[];
    mapping: BomColumnMapping;
    mapping_source: string;
    mapping_confidence: number;
    needs_review: boolean;
    warnings: string[];
    rows_preview: Record<string, unknown>[];
    parts_preview: Array<{
        mpn?: string | null;
        part_number?: string | null;
        manufacturer?: string | null;
        quantity?: number | null;
        designator?: string | null;
    }>;
    part_count: number;
    total_quantity: number;
}

// Alias so older components that import UploadBOMResponse still compile
export type UploadBOMResponse = UploadResponse;

export type PartParamValue =
    | string
    | number
    | boolean
    | null
    | {
        display_value?: string | number | null;
        value?: unknown;
        units?: string | null;
        si_value?: unknown;
        [key: string]: unknown;
    };

export type PartParams = Record<string, PartParamValue>;

export interface WebCandidate {
    mpn: string;
    manufacturer?: string | null;
    description?: string | null;
    datasheet_url?: string | null;
    product_url?: string | null;
    category?: string | null;
    source: string;
    confidence: number;
}

export type IdentifyStreamEvent =
    | { type: 'start'; total: number }
    | { type: 'cache_pass'; cached_count: number; remaining: number }
    | { type: 'external_lookup_start'; count: number; concurrency: number }
    | { type: 'searching'; mpn: string }
    | { type: 'found'; mpn: string; source: string; category: string | null; description: string | null; datasheet_url?: string | null; product_url?: string | null; params?: PartParams | null }
    | { type: 'web_found'; mpn: string; source: string; candidates: WebCandidate[] }
    | { type: 'not_found'; mpn: string; status: string }
    | { type: 'complete'; identified: number; total: number; review_blockers?: number; status?: string }
    | { type: 'error'; message: string; status?: IdentifyRunStatus };

// Phase 4+ types (stubs filled in as phases complete).

export interface PartCandidate {
    mpn: string;
    manufacturer?: string | null;
    category?: string | null;
    description?: string | null;
    datasheet_url?: string | null;
    product_url?: string | null;
    is_exact_match?: boolean;
}

export interface PartDetail {
    subsystem_id?: string | null;
    part_number: string;
    manufacturer?: string | null;
    category?: string | null;
    description?: string | null;
    datasheet_url?: string | null;
    source: string;
    confidence: number;
    needs_review: boolean;
    candidates: PartCandidate[];
    classification?: 'auxiliary' | 'non-auxiliary' | null;
    instance_function?: string | null;
    params?: PartParams | null;
}

export interface SystemSuggestion {
    systemType: string;
    primaryFunction: string;
    confidence: 'high' | 'medium' | 'low';
    keyArchitecturalClues: string[];
    reasoning: string;
    suggestedStandards: string[];
}

export interface ValidationResult {
    mpn: string;
    status: 'valid' | 'unresolved';
    issues?: string[];
    classification?: 'auxiliary' | 'non-auxiliary' | null;
    manufacturer?: string | null;
    category?: string | null;
    description?: string | null;
    datasheet_url?: string | null;
    quantity?: number | null;
    source?: string | null;
    confidence?: number | null;
    params?: PartParams | null;
    availability?: { total_avail?: number | null; lead_time_days?: number | null } | null;
    pricing?: { per_1000?: number | null } | null;
    candidates?: PartCandidate[];
    message?: string | null;
    extraction_status?: PartEnrichmentState | 'not_started';
    failure_reason?: string | null;
    has_model?: boolean;
}

export interface PartReviewResponse {
    success: boolean;
    total_parts: number;
    valid_parts: number;
    invalid_parts: number;
    auxiliary_parts_skipped: number;
    validation_results: ValidationResult[];
}

export type PartReviewUiStatus = 'pending' | 'enriching' | 'done' | 'failed' | 'user_provided';

export interface PartReviewEnrichmentStatus {
    statuses: Record<string, PartReviewUiStatus>;
    all_done: boolean;
    done_count: number;
    failed_count: number;
    total: number;
}

export interface ConnectionInferenceSource {
    layer: 'mutual_compat' | 'unidirect_compat' | 'power_domain' | 'requirement_elevation' | 'typical_connection' | 'llm' | 'manual';
    confidence?: number;
    [key: string]: unknown;
}

export interface Connection {
    id?: string;
    net_id?: string | null;
    source_part: string;
    target_part: string | null;
    source_part_number?: string;
    target_part_number?: string;
    connection_type: string;
    signal_name?: string | null;
    reasoning?: string | null;
    confidence?: number | null;
    status?: string | null;
    notes?: string | null;
    source_requirement_ids?: string[];
    inference_sources?: ConnectionInferenceSource[];
    source_pin?: string | null;
    target_pin?: string | null;
    pin_confidence?: number | null;
    pin_reasoning?: string | null;
    pin_resolution_source?: string | null;
    user_corrected?: boolean | null;
}

export interface ConnectionsResponse {
    connections: Connection[];
    accepted?: boolean;
    workflow_id?: string | null;
    /** true when Temporal workflow is paused at connections_review; inference succeeded but human confirmation is pending */
    pending_review?: boolean;
    message?: string;
}

export type ArchitectureNetStatus = 'suggested' | 'confirmed' | 'rejected' | 'hidden' | 'ungrouped';

export interface ArchitectureNetMember {
    id: string;
    source_part: string;
    target_part: string | null;
    connection_type: string;
    signal_name?: string | null;
    source_pin?: string | null;
    target_pin?: string | null;
    status?: string | null;
    confidence?: number | null;
}

export interface ArchitectureNet {
    id: string;
    design_id?: string;
    name: string;
    net_type: string;
    voltage?: string | null;
    is_boundary?: boolean | null;
    status?: ArchitectureNetStatus | string | null;
    ai_generated?: boolean | null;
    user_corrected?: boolean | null;
    confidence?: number | null;
    reasoning?: string | null;
    source_requirement_ids?: string[];
    rule_metadata?: Record<string, unknown> | null;
    layout?: Record<string, unknown> | null;
    created_at?: string | null;
    updated_at?: string | null;
    member_connection_ids?: string[];
    members?: ArchitectureNetMember[];
}

export interface NetsResponse {
    nets: ArchitectureNet[];
}

export type NetDeleteMode = 'ungroup' | 'delete_links' | 'move';
export type ArchitectureNetPatch = Partial<Pick<ArchitectureNet,
    'name' | 'net_type' | 'voltage' | 'is_boundary' | 'status' | 'confidence' | 'reasoning' |
    'source_requirement_ids' | 'rule_metadata' | 'layout'
>>;
export type ArchitectureNetCreate = Pick<ArchitectureNet, 'name'> & ArchitectureNetPatch;
export interface ArchitectureNetMergeBody {
    target_net_id: string;
    source_net_ids: string[];
}
export interface ArchitectureNetSplitBody {
    name: string;
    connection_ids: string[];
}
export type ArchitectureNetMutationResponse = ArchitectureNet | (Partial<ArchitectureNet> & { id: string; deleted_member_count?: number });

export interface ArchitectureCompletionReadinessItem {
    type: 'suggested_net' | 'unresolved_connection' | 'pinless_connection' | 'empty_architecture' | string;
    id?: string | null;
    label: string;
    severity?: 'blocking' | 'warning' | string;
    payload?: Record<string, unknown>;
}

export interface ArchitectureCompletionReadiness {
    can_complete: boolean;
    blockers: ArchitectureCompletionReadinessItem[];
    warnings: ArchitectureCompletionReadinessItem[];
    counts: {
        suggested_nets: number;
        unresolved_connections: number;
        pinless_connections: number;
        active_connections: number;
        [key: string]: number;
    };
}

export type ArchitectureProposalAction =
    | 'rename_net'
    | 'change_net_type'
    | 'split_net'
    | 'merge_nets'
    | 'add_member'
    | 'remove_member'
    | 'resolve_pin'
    | 'unresolved_connection'
    | 'flag_issue';

export interface ArchitectureProposalRecord {
    id: string;
    design_id?: string;
    action: ArchitectureProposalAction | string;
    proposal_type?: ArchitectureProposalAction | string;
    title?: string | null;
    rationale?: string | null;
    reasoning?: string | null;
    payload?: Record<string, unknown>;
    evidence?: Record<string, unknown>[];
    confidence?: number | null;
    created_by?: string | null;
    status?: 'pending' | 'applied' | 'dismissed' | string;
    target_net_id?: string | null;
    target_connection_id?: string | null;
    source_net_ids?: string[];
    connection_ids?: string[];
    result_payload?: Record<string, unknown>;
    created_at?: string | null;
    applied_at?: string | null;
    dismissed_at?: string | null;
}

export interface ArchitectureProposalsResponse {
    proposals: ArchitectureProposalRecord[];
}

export interface ConnectionStatusResponse {
    enabled: boolean;
    available: boolean;
    workflow_id: string;
    current_stage?: string;
    result?: { connection_count?: number; skipped?: boolean } | null;
    last_error?: string | null;
    error?: string;
}

export interface SubsystemConnection {
    id?: string | null;
    name?: string | null;
    label?: string | null;
    net_id?: string | null;
    connection_id?: string | null;
    source_port_id?: string | null;
    target_port_id?: string | null;
    source_subsystem?: string;
    target_subsystem?: string;
    source_subsystem_name?: string | null;
    target_subsystem_name?: string | null;
    interface_type?: string | null;
    signal_type?: string | null;
    direction?: string | null;
    status?: 'suggested' | 'confirmed' | 'rejected' | string;
    ai_generated?: boolean;
    user_corrected?: boolean;
    confidence?: number | null;
    rationale?: string | null;
    constraints_json?: Record<string, unknown> | null;
    verification_method?: string | null;
    is_stale?: boolean;
    staleness_reason?: string | null;
    evidence_hash?: string | null;
    evidence_count?: number;
    linked_requirements_count?: number;
    description?: string | null;
    source_subsystem_id: string;
    target_subsystem_id: string;
    connection_types: string[];
    primary_type: string;
    part_connection_count: number;
}

export type SubsystemInterfaceContract = SubsystemConnection & {
    evidence?: SubsystemInterfaceEvidence[];
    linked_requirements?: SubsystemRequirementItem[];
    linked_subsystem_requirements?: SubsystemRequirementItem[];
    linked_subsystem_requirements_count?: number;
};

export interface SubsystemInterfaceEvidence {
    id: string;
    design_id: string;
    interface_id: string;
    evidence_type: 'net' | 'design_connection' | 'part_model' | 'requirement' | 'manual' | string;
    evidence_id?: string | null;
    evidence_fingerprint?: string | null;
    evidence_payload: Record<string, unknown>;
    created_at?: string | null;
}

export interface SubsystemPort {
    id: string;
    design_id: string;
    subsystem_id: string;
    name: string;
    port_type: string;
    direction: string;
    description?: string | null;
    status?: string;
    ai_generated?: boolean;
    user_corrected?: boolean;
    confidence?: number | null;
    rationale?: string | null;
}

export interface SubsystemRequirementItem {
    // Identity
    id: string;
    req_id: string;
    req_key?: string | null;
    subsystem_id: string;
    design_id?: string | null;

    // Content
    title?: string | null;
    description: string;
    requirement_text?: string;
    rationale?: string | null;
    acceptance_criteria?: string | null;
    verification_method?: string | null;
    verification_status?: string | null;
    criteria_json?: Record<string, unknown> | null;
    criteria?: string;

    // Workflow + audit
    priority?: string | null;
    status?: string | null;
    ai_generated?: boolean;
    confidence?: number | null;
    quality_warnings?: string[];
    is_stale?: boolean;
    staleness_reason?: string | null;
    stale?: boolean;

    // Chain
    parent_req_id?: string | null;
    parent_req_key?: string | null;
    parent_req_title?: string | null;
    interface_id?: string | null;
    interface_name?: string | null;
    interface_type?: string | null;
    interface_label?: string | null;

    // Mapped parts
    mapped_part_ids?: string[];
    mapped_parts?: ReviewSubsystem['parts'];
    source_mpns?: string[];
    mapped_components: string[];

    // Legacy compat fields used by views/tests
    success?: boolean;
    requirement?: SubsystemRequirementItem;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface Requirement {
    id: string;
    req_id: string;
    req_key?: string | null;
    original_req_id: string;
    title: string;
    description: string;
    specification: string;
    requirement_text: string;
    category: string;
    priority?: string | null;
    source?: string | null;
    provenance?: string | null;
    rationale?: string | null;
    acceptance_criteria?: string | null;
    verification_method?: string | null;
    verification_status?: string | null;
    status?: string | null;
    source_mpns: string[];
    source_standards: string[];
    bom_reference: string[];
    quality_warnings?: string[];
    confidence?: number | null;
    ai_generated?: boolean;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface RequirementsResponse {
    success: boolean;
    accepted?: boolean;
    workflow_id?: string | null;
    requirements_count: number;
    total?: number;
    requirements: Requirement[];
    by_category?: Record<string, Requirement[]>;
    message?: string;
    ready_to_continue?: boolean;
    review_blockers?: string[];
}

export interface RequirementsStatusResponse {
    enabled: boolean;
    available: boolean;
    workflow_id: string;
    current_stage?: string;
    result?: Record<string, unknown> | null;
    last_error?: string | null;
    error?: string;
}

export interface RequirementProposal {
    id: string;
    proposal_type: string;
    target_requirement_id?: string | null;
    title?: string | null;
    description?: string | null;
    specification?: string | null;
    payload: Partial<Requirement>;
    rationale?: string | null;
    evidence?: Array<Record<string, unknown>>;
    confidence?: number | null;
    status: string;
    created_by?: string | null;
    created_at?: string | null;
}

export interface RequirementHistoryEvent {
    id: string;
    requirement_id: string;
    event_type: string;
    actor?: string | null;
    reason?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    created_at?: string | null;
}

export interface RequirementSourceEvidence {
    id: string;
    requirement_id: string;
    source_type: string;
    source_id: string;
    source_label?: string | null;
    field_path?: string | null;
    evidence_text?: string | null;
    confidence?: number | null;
}

export type RequirementDetailResponse = Requirement & {
    history?: RequirementHistoryEvent[];
    sources?: RequirementSourceEvidence[];
};

export interface TraceabilityRequirementRow {
    req_id: string;
    req_key?: string | null;
    title?: string | null;
    category?: string | null;
    priority?: string | null;
    status?: string | null;
    verification_method?: string | null;
    acceptance_criteria?: string | null;
    specification?: string | null;
    quality_warnings?: string[];
    source_mpns: string[];
    source_standards: string[];
    sources?: RequirementSourceEvidence[];
    gap_flags?: string[];
}

export interface TraceabilityColumn {
    id: string;
    label: string;
    type: 'component' | 'standard';
}

export interface TraceabilityCell {
    requirement_id: string;
    column_id: string;
    column_type: 'component' | 'standard';
    linked: boolean;
    confidence?: number | null;
    evidence?: RequirementSourceEvidence | null;
}

export interface TraceabilityCoverage {
    requirements_total: number;
    requirements_traced: number;
    requirements_untraced: number;
    missing_verification: number;
    missing_acceptance: number;
    components_total: number;
    standards_total: number;
}

export interface TraceabilityMatrixResponse {
    success: boolean;
    requirements: TraceabilityRequirementRow[];
    columns: TraceabilityColumn[];
    cells: TraceabilityCell[];
    coverage: TraceabilityCoverage;
}

export interface PartSpecEvidence {
    [key: string]: unknown;
    Category?: string;
    Description?: string;
    manufacturer?: string;
    datasheet_url?: string;
    product_url?: string;
    source?: string;
    confidence?: number | null;
    part_function?: string;
    topology_family?: string;
    params?: PartParams;
    model?: Record<string, unknown> | null;
    model_extracted_at?: string | null;
}

export interface ChatHistoryMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
}

export interface ChatHistoryResponse {
    messages: ChatHistoryMessage[];
}

export type ChatStreamEvent =
    | { type: 'token'; content: string }
    | { type: 'done' }
    | { type: 'error'; message: string };

// Designs (v2 native)

export async function createDesign(projectName: string, userId?: string): Promise<Design> {
    const body = new FormData();
    body.append('project_name', projectName);
    if (userId) body.append('user_id', userId);
    return apiJSON(`${BASE_URL}/designs`, { method: 'POST', body });
}

export async function previewDesignBOM(file: File): Promise<BomPreviewResponse> {
    const body = new FormData();
    body.append('file', file);
    return apiJSON<BomPreviewResponse>(`${BASE_URL}/designs/bom/preview`, { method: 'POST', body });
}

export async function uploadDesignBOM(
    projectName: string,
    file: File,
    userId?: string,
    mapping?: BomColumnMapping,
): Promise<UploadResponse> {
    const body = new FormData();
    body.append('project_name', projectName);
    if (userId) body.append('user_id', userId);
    if (mapping) body.append('mapping_json', JSON.stringify(mapping));
    body.append('file', file);
    const response = await apiJSON<UploadResponse>(`${BASE_URL}/designs/upload`, { method: 'POST', body });
    return {
        ...response,
        parts_count: response.parts_count ?? response.part_count,
        rows_preview: response.rows_preview ?? [],
        parts_preview: response.parts_preview ?? [],
    };
}

export interface DesignListPage {
    items: Design[];
    total: number;
    total_completed: number;
    total_in_progress: number;
    limit: number;
    offset: number;
    has_more: boolean;
}

/** Paginated. Use this for the library page; `listDesigns()` (which fetches
 * the first page only) is kept as a thin alias for any other callers. */
export async function listDesignsPaged(opts?: {
    limit?: number;
    offset?: number;
    userId?: string;
}): Promise<DesignListPage> {
    const limit = opts?.limit ?? 20;
    const offset = opts?.offset ?? 0;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (opts?.userId) params.set('user_id', opts.userId);
    return apiJSON(`${BASE_URL}/designs?${params.toString()}`);
}

export async function listDesigns(): Promise<Design[]> {
    // Backwards-compatible: returns only the first page (20). Other call sites
    // that need full results should migrate to listDesignsPaged().
    const page = await listDesignsPaged();
    return page.items;
}

export async function getDesign(designId: string): Promise<Design> {
    const design = await apiJSON<Omit<Design, 'current_stage'> & { current_stage?: number }>(`${BASE_URL}/designs/${designId}`);
    return { ...design, current_stage: design.current_stage ?? fsmToStage(design.fsm_state) };
}

export async function uploadBOM(designId: string, file: File, mapping?: BomColumnMapping): Promise<UploadResponse> {
    const body = new FormData();
    if (mapping) body.append('mapping_json', JSON.stringify(mapping));
    body.append('file', file);
    const response = await apiJSON<UploadResponse>(`${BASE_URL}/designs/${designId}/bom`, { method: 'POST', body });
    return {
        ...response,
        parts_count: response.parts_count ?? response.part_count,
        rows_preview: response.rows_preview ?? [],
        parts_preview: response.parts_preview ?? [],
    };
}

export async function getParts(designId: string): Promise<DesignPart[]> {
    return apiJSON(`${BASE_URL}/designs/${designId}/parts`);
}

export async function identifyPartsStream(
    designId: string,
    onEvent: (event: IdentifyStreamEvent) => void,
    _setStage?: (stage: number | null) => void,
): Promise<void> {
    const res = await apiFetch(`${BASE_URL}/designs/${designId}/pipeline/identify/stream`, { method: 'POST' });
    if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(`Identify stream failed: ${res.status} ${text}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let reviewBlockers = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
                const event = JSON.parse(line.slice(6)) as IdentifyStreamEvent;
                if (API_DEBUG) console.log('%c  [SSE]', 'color:#a78bfa', event);
                onEvent(event);
                if (event.type === 'web_found' || event.type === 'not_found') {
                    reviewBlockers += 1;
                }
                if (event.type === 'complete') {
                    const blockers = event.review_blockers ?? reviewBlockers;
                    _setStage?.(blockers > 0
                        ? fsmToStage('bom_uploaded')
                        : fsmToStage('parts_identified'));
                }
            } catch { /* skip malformed */ }
        }
    }
}

export interface IdentifyRunStatus {
    status: 'idle' | 'running' | 'complete' | 'failed' | string;
    total: number;
    done: number;
    identified: number;
    review_blockers: number;
    started_at?: string | null;
    finished_at?: string | null;
    error?: string | null;
    events?: IdentifyStreamEvent[];
}

export async function getIdentifyStatus(designId: string): Promise<IdentifyRunStatus> {
    return apiJSON(`${BASE_URL}/designs/${designId}/pipeline/identify/status`);
}

export async function getEvents(designId: string, limit = 50) {
    return apiJSON<unknown[]>(`${BASE_URL}/designs/${designId}/events?limit=${limit}`);
}

// getBOMBySessionId
export async function getBOMBySessionId(sessionId: string): Promise<Design> {
    return getDesign(sessionId);
}

// getAllBOMs wraps listDesigns for the library page.
export function fsmToStage(fsm: string): number {
    const map: Record<string, number> = {
        empty: 1,
        bom_uploaded: 2,
        parts_identified: 3,
        // Suggestions exist, but the human review gate has not been accepted yet.
        system_analyzed: 3,
        system_type_confirmed: 4,
        classified: 5,
        enriching: 5,
        enriched: 6,
        validated: 7,
        requirements_generated: 8,
        connections_built: 9,
        subsystems_defined: 10,
        subsystems_generated: 10,
        complete: 10,
    };
    return map[fsm] ?? 1;
}

export interface BomListItem {
    bom_id: string;
    system_type: string | null;
    current_stage: number;
    total_parts: number;
    created_at: string;
}

export interface BomListPage {
    boms: BomListItem[];
    total: number;
    total_completed: number;
    total_in_progress: number;
    limit: number;
    offset: number;
    has_more: boolean;
}

/** Library page: paginated. Defaults to 20 per page. */
export async function getAllBOMs(opts?: {
    limit?: number;
    offset?: number;
}): Promise<BomListPage> {
    const page = await listDesignsPaged({
        limit: opts?.limit ?? 20,
        offset: opts?.offset ?? 0,
    });
    return {
        boms: page.items.map(d => ({
            bom_id: d.id,
            system_type: d.project_name,
            current_stage: d.current_stage ?? fsmToStage(d.fsm_state),
            total_parts: 0,
            created_at: d.created_at,
        })),
        total: page.total,
        total_completed: page.total_completed,
        total_in_progress: page.total_in_progress,
        limit: page.limit,
        offset: page.offset,
        has_more: page.has_more,
    };
}

// Current workflow stage
export async function getCurrentStage(sessionId: string): Promise<{ current_stage: number; stage: number; stage_name: string }> {
    const design = await getDesign(sessionId);
    const currentStage = design.current_stage ?? fsmToStage(design.fsm_state);
    return { current_stage: currentStage, stage: currentStage, stage_name: design.fsm_state };
}

export async function updateCurrentStageInContext(sessionId: string, setStage?: (stage: number | null) => void): Promise<void> {
    if (!setStage) return;
    const { current_stage } = await getCurrentStage(sessionId);
    setStage(current_stage);
}

// Phase 4: classify

export async function classifyParts(designId: string): Promise<{ classification_map: Record<string, string | null> }> {
    let streamError: string | null = null;
    await classifyPartsStream(designId, event => {
        if (event.type === 'error') streamError = event.message;
    });
    if (streamError) throw new Error(streamError);
    return { classification_map: (await getClassification(designId)).classification_map };
}

export type ClassificationStreamEvent =
    | { type: 'start'; total: number; message: string }
    | { type: 'searching'; mpn: string }
    | {
        type: 'exact_match' | 'multi_match' | 'found' | 'cached';
        mpn: string;
        category?: string | null;
        description?: string | null;
        source?: string;
        candidate_count?: number;
        candidates?: PartCandidate[];
    }
    | {
        type: 'web_found';
        mpn: string;
        source?: string;
        description?: string | null;
        datasheet_url?: string | null;
        product_url?: string | null;
        confidence?: string;
    }
    | { type: 'not_found'; mpn: string }
    | { type: 'classifying'; message: string }
    | {
        type: 'complete';
        result: {
            non_auxiliary_parts: number;
            auxiliary_parts: number;
            parts?: PartDetail[];
        };
    }
    | { type: 'error'; message: string };

export async function classifyPartsStream(
    designId: string,
    onEvent: (event: ClassificationStreamEvent) => void,
    options?: { contextHint?: string },
): Promise<void> {
    const url = new URL(`${BASE_URL}/designs/${designId}/classification/stream`);
    if (options?.contextHint?.trim()) url.searchParams.set('context_hint', options.contextHint.trim());
    const res = await apiFetch(url.toString());
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try { onEvent(JSON.parse(line.slice(6)) as ClassificationStreamEvent); } catch { /* skip */ }
            }
        }
    }
}

// New event shape from the parallel-streaming endpoint. Identification replay
// events keep their existing types; only the classification phase changes.
// Note: nullable backend values are normalised to undefined here so they fit
// the existing StreamLine consumer without per-callsite null handling.
export type ClassificationStreamParallelEvent =
    | { type: 'start'; total: number; message: string }
    | { type: 'searching'; mpn: string }
    | { type: 'exact_match'; mpn: string; category?: string; source?: string; description?: string; candidates?: PartCandidate[] }
    | { type: 'multi_match'; mpn: string; candidate_count: number; source?: string; description?: string; candidates?: PartCandidate[] }
    | { type: 'web_found'; mpn: string; source?: string; description?: string; datasheet_url?: string; product_url?: string; confidence?: string }
    | { type: 'found' | 'cached'; mpn: string; category?: string; source?: string; candidates?: PartCandidate[]; description?: string }
    | { type: 'not_found'; mpn: string }
    | { type: 'ready'; total: number; batch_count: number; batch_size: number; parallel: number }
    | { type: 'classified'; index: number; mpn: string; classification: 'non-auxiliary' | 'auxiliary'; reasoning?: string; instance_function?: string }
    | { type: 'batch_failed'; batch_index: number; message: string }
    | { type: 'complete'; total: number; classified_count: number; counts: { non_auxiliary: number; auxiliary: number }; batch_failures: { batch_index: number; message: string }[]; parts?: PartDetail[] }
    | { type: 'error'; message: string };

/** Parallel-batched, per-part-streaming classification. Verdicts arrive as
 * Gemini produces each one. Total time ~10s for typical BOMs vs ~30s single-call. */
export async function classifyPartsStreamParallel(
    designId: string,
    onEvent: (event: ClassificationStreamParallelEvent) => void,
    options?: { contextHint?: string },
): Promise<void> {
    const url = new URL(`${BASE_URL}/designs/${designId}/classification/stream/parallel`);
    if (options?.contextHint?.trim()) url.searchParams.set('context_hint', options.contextHint.trim());
    const res = await apiFetch(url.toString(), { method: 'POST' });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try { onEvent(JSON.parse(line.slice(6)) as ClassificationStreamParallelEvent); } catch { /* skip */ }
            }
        }
    }
}

export async function getClassification(designId: string): Promise<{
    parts: PartDetail[];
    classification_map: Record<string, string | null>;
    total_parts: number;
    non_auxiliary_parts: number;
    auxiliary_parts: number;
}> {
    const result = await apiJSON<{
        parts?: PartDetail[];
        classification_map?: Record<string, string | null>;
        total_parts?: number;
        non_auxiliary_parts?: number;
        auxiliary_parts?: number;
    }>(`${BASE_URL}/designs/${designId}/classification`);
    const parts = result.parts ?? [];
    const classificationMap = result.classification_map ?? {};
    const values = Object.values(classificationMap);
    return {
        parts,
        classification_map: classificationMap,
        total_parts: result.total_parts ?? parts.length ?? values.length,
        non_auxiliary_parts: result.non_auxiliary_parts ?? values.filter(value => value === 'non-auxiliary').length,
        auxiliary_parts: result.auxiliary_parts ?? values.filter(value => value === 'auxiliary').length,
    };
}

export async function bulkUpdateClassification(
    designId: string,
    updates: { mpn: string; new_classification: string }[],
    _setStage?: (stage: number | null) => void,
): Promise<void> {
    await apiJSON(`${BASE_URL}/designs/${designId}/classification/bulk`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
    });
    _setStage?.(fsmToStage('classified'));
}

export async function selectPartMatch(
    designId: string,
    mpn: string,
    candidate: PartCandidate,
): Promise<void> {
    await apiJSON(`${BASE_URL}/designs/${designId}/parts/${encodeMpn(mpn)}/select-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
    });
}

export async function confirmWebPart(
    designId: string,
    mpn: string,
    product_url: string | null,
    datasheet_url: string | null,
    description: string | null,
    _extra?: unknown,
): Promise<void> {
    void _extra;
    await apiJSON(`${BASE_URL}/designs/${designId}/parts/${encodeMpn(mpn)}/web-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            selected_mpn: mpn,
            product_url,
            datasheet_url,
            description,
        }),
    });
}

export async function saveCustomPart(
    designId: string,
    mpn: string,
    fields: {
        manufacturer?: string;
        description?: string;
        category?: string;
        datasheet_url?: string;
        specs?: Record<string, string>;
        datasheetFile?: File;
    },
): Promise<void> {
    const body = new FormData();
    if (fields.description) body.append('description', fields.description);
    if (fields.manufacturer) body.append('manufacturer', fields.manufacturer);
    if (fields.category) body.append('category', fields.category);
    if (fields.datasheet_url) body.append('datasheet_url', fields.datasheet_url);
    if (fields.specs) body.append('params', JSON.stringify(fields.specs));
    if (fields.datasheetFile) body.append('datasheet_file', fields.datasheetFile);
    await apiJSON(`${BASE_URL}/designs/${designId}/parts/${encodeMpn(mpn)}/custom`, {
        method: 'POST',
        body,
    });
}

export interface PartIdentificationResolution {
    original_mpn: string;
    action: 'select_match' | 'web_confirm' | 'custom' | 'skip';
    selected_mpn?: string | null;
    manufacturer?: string | null;
    category?: string | null;
    description?: string | null;
    datasheet_url?: string | null;
    product_url?: string | null;
    params?: PartParams | null;
    source?: string | null;
}

export async function confirmPartIdentificationReview(
    designId: string,
    resolutions: PartIdentificationResolution[],
): Promise<{ success: boolean; failures: Array<{ mpn: string; error: string }>; review_blockers?: number }> {
    return apiJSON(`${BASE_URL}/designs/${designId}/parts/identification/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutions }),
    });
}

export async function renamePart(designId: string, mpn: string, newMpn: string): Promise<void> {
    await apiJSON(`${BASE_URL}/designs/${designId}/parts/${encodeMpn(mpn)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_mpn: newMpn }),
    });
}

export async function suggestPartFields(
    designId: string,
    mpn: string,
    description: string | null,
    category: string | null,
): Promise<string[]> {
    const result = await apiJSON<{ fields: string[] }>(
        `${BASE_URL}/designs/${designId}/parts/${encodeMpn(mpn)}/suggest-fields`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description, category }),
        },
    );
    return result.fields;
}

// Phase 5: system analysis

export async function analyzeSystem(designId: string, additionalContext?: string): Promise<{ suggestions: SystemSuggestion[]; error?: string | null }> {
    await apiJSON(`${BASE_URL}/designs/${designId}/pipeline/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additional_context: additionalContext ?? null }),
    });
    return { suggestions: [] };
}

export type AnalyzeStreamEvent =
    | { type: 'start' }
    | { type: 'suggestion'; index: number; suggestion: SystemSuggestion }
    | { type: 'cache_hit'; count: number; suggestions: SystemSuggestion[] }
    | { type: 'complete'; count: number; suggestions: SystemSuggestion[] }
    | { type: 'error'; message: string };

/** Stream system-analysis suggestions from Gemini as they arrive.
 * Each suggestion event fires as soon as one full suggestion object is
 * available. Total elapsed time is the same as analyzeSystem() but the
 * UI sees the first suggestion in ~1-2s instead of ~30s. */
export async function analyzeSystemStream(
    designId: string,
    additionalContext: string | undefined,
    onEvent: (event: AnalyzeStreamEvent) => void,
    options?: { forceRefresh?: boolean },
): Promise<void> {
    const params = options?.forceRefresh ? '?force_refresh=true' : '';
    const res = await apiFetch(
        `${BASE_URL}/designs/${designId}/pipeline/analyze/stream${params}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ additional_context: additionalContext ?? null }),
        },
    );
    if (!res.ok || !res.body) {
        const text = await res.text();
        throw new Error(`Analyze stream failed: ${res.status} ${text}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
                const event = JSON.parse(line.slice(6)) as AnalyzeStreamEvent;
                onEvent(event);
            } catch {
                // skip malformed line
            }
        }
    }
}

export async function getSystemAnalysis(designId: string): Promise<{
    success: boolean;
    suggestions: SystemSuggestion[];
    system_type: string | null;
    standards: string[];
    confirmed: boolean;
    error?: string | null;
}> {
    return apiJSON(`${BASE_URL}/designs/${designId}/system-profile`);
}


export async function selectSystemType(designId: string, index: number): Promise<void> {
    await apiJSON(`${BASE_URL}/designs/${designId}/system-profile/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
    });
}

export async function confirmSystemType(designId: string, index: number): Promise<void> {
    return selectSystemType(designId, index);
}

// Phase 6: part review, enrichment, and connections

function _reviewStatusFromEnrichment(part?: PartEnrichmentDetail): 'valid' | 'unresolved' {
    return part?.has_model ? 'valid' : 'unresolved';
}

function _messageFromEnrichment(part?: PartEnrichmentDetail): string | null {
    if (!part) return 'Model enrichment has not started for this part.';
    if (part.has_model) return null;
    if (part.status === 'extracting') return 'Extracting technical model from datasheet.';
    if (part.status === 'failed') return part.failure_reason || 'Model extraction failed.';
    if (part.status === 'no_datasheet') return 'No usable datasheet is available for model extraction.';
    return null;
}

async function buildPartReview(designId: string): Promise<PartReviewResponse> {
    const [classification, enrichment] = await Promise.all([
        getClassification(designId),
        getModelEnrichmentStatus(designId).catch(() => null),
    ]);

    const enrichmentByMpn = new Map<string, PartEnrichmentDetail>();
    for (const part of enrichment?.parts ?? []) {
        enrichmentByMpn.set(part.mpn, part);
    }

    const auxiliaryParts = classification.parts.filter(p => p.classification === 'auxiliary');
    const nonAuxParts = classification.parts.filter(p => p.classification !== 'auxiliary');

    const validation_results: ValidationResult[] = nonAuxParts.map((part) => {
        const mpn = part.part_number;
        const enrichmentPart = enrichmentByMpn.get(mpn);
        const params = part.params ?? null;
        return {
            mpn,
            status: _reviewStatusFromEnrichment(enrichmentPart),
            classification: part.classification ?? null,
            manufacturer: part.manufacturer ?? null,
            category: part.category ?? null,
            description: part.description ?? null,
            datasheet_url: part.datasheet_url ?? null,
            quantity: null,
            source: enrichmentPart?.source ?? part.source ?? null,
            confidence: part.confidence ?? null,
            params,
            availability: (params?.availability as ValidationResult['availability']) ?? null,
            pricing: (params?.pricing as ValidationResult['pricing']) ?? null,
            candidates: part.candidates ?? [],
            message: _messageFromEnrichment(enrichmentPart),
            extraction_status: enrichmentPart?.status ?? 'not_started',
            failure_reason: enrichmentPart?.failure_reason ?? null,
            has_model: enrichmentPart?.has_model ?? false,
        };
    });

    const valid_parts = validation_results.filter(r => r.status === 'valid').length;
    const invalid_parts = validation_results.length - valid_parts;

    return {
        success: true,
        total_parts: validation_results.length,
        valid_parts,
        invalid_parts,
        auxiliary_parts_skipped: auxiliaryParts.length,
        validation_results,
    };
}

export async function validateParts(designId: string, _setStage?: (stage: number | null) => void): Promise<PartReviewResponse> {
    const result = await getValidationResults(designId);
    await confirmPartReview(designId, _setStage);
    return result;
}

export async function getValidationResults(designId: string): Promise<PartReviewResponse> {
    return buildPartReview(designId);
}

export async function confirmPartReview(
    designId: string,
    _setStage?: (stage: number | null) => void,
): Promise<{ success: boolean; fsm_state: string }> {
    const result = await apiJSON<{ success: boolean; fsm_state: string }>(
        `${BASE_URL}/designs/${designId}/parts/review/confirm`,
        { method: 'POST' },
    );
    if (_setStage) {
        const { current_stage } = await getCurrentStage(designId);
        _setStage(current_stage);
    }
    return result;
}

export async function startEnrichFundamentals(designId: string): Promise<{ count: number; status?: string }> {
    const current = await getModelEnrichmentStatus(designId).catch(() => null);
    if (current?.complete) {
        return { count: current.total, status: 'nothing_to_enrich' };
    }
    const stage = await getCurrentStage(designId).catch(() => null);
    if ((stage?.current_stage ?? 0) >= fsmToStage('enriched')) {
        return { count: current?.total ?? 0, status: 'nothing_to_enrich' };
    }

    const response = await triggerModelEnrichment(designId);
    const status = await getModelEnrichmentStatus(designId).catch(() => current);
    return {
        count: response.total ?? status?.total ?? 0,
        status: response.status,
    };
}

export async function getEnrichmentStatus(designId: string): Promise<PartReviewEnrichmentStatus> {
    const status = await getModelEnrichmentStatus(designId);
    const statuses: Record<string, PartReviewUiStatus> = {};
    for (const part of status.parts) {
        if (part.status === 'done') statuses[part.mpn] = 'done';
        else if (part.status === 'extracting') statuses[part.mpn] = 'enriching';
        else if (part.status === 'failed' || part.status === 'no_datasheet') statuses[part.mpn] = 'failed';
        else statuses[part.mpn] = 'pending';
    }
    return {
        statuses,
        all_done: status.complete,
        done_count: status.done,
        failed_count: status.failed + status.no_datasheet,
        total: status.total,
    };
}

export async function analyzeConnections(designId: string): Promise<ConnectionsResponse> {
    const started = await apiJSON<ConnectionsResponse>(`${BASE_URL}/designs/${designId}/connections/analyze`, {
        method: 'POST',
    });

    // Sync path (USE_TEMPORAL=false): backend ran inference synchronously.
    if (!started.accepted || !started.workflow_id) {
        return started;
    }

    // Async path (USE_TEMPORAL=true): poll until inference finishes OR hits HITL review gate.
    // 'connections_review' means inference succeeded; results are ready for human review.
    // 'complete' means workflow finished (HITL signal was sent or review timed out).
    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2000));
        const status = await apiJSON<ConnectionStatusResponse>(
            `${BASE_URL}/designs/${designId}/connections/status/${started.workflow_id}`,
        );
        if (!status.available || status.error || status.last_error || status.current_stage === 'failed') {
            throw new Error(status.last_error || status.error || 'Connection analysis failed');
        }
        if (status.current_stage === 'connections_review' || status.current_stage === 'complete') {
            const conns = await getConnections(designId);
            return {
                ...conns,
                workflow_id: started.workflow_id,
                // Flag pending review so the architecture page can send the confirm-all signal
                pending_review: status.current_stage === 'connections_review',
            };
        }
    }

    throw new Error('Connection analysis timed out. Refresh the page to check results.');
}

export async function getConnections(designId: string, _legacySessionId?: string): Promise<ConnectionsResponse> {
    void _legacySessionId;
    return apiJSON<ConnectionsResponse>(`${BASE_URL}/designs/${designId}/connections`);
}

export async function getNets(designId: string): Promise<NetsResponse> {
    return apiJSON<NetsResponse>(`${BASE_URL}/designs/${designId}/nets`);
}

export async function getArchitectureCompletionReadiness(
    designId: string,
): Promise<ArchitectureCompletionReadiness> {
    return apiJSON<ArchitectureCompletionReadiness>(
        `${BASE_URL}/designs/${designId}/architecture/completion-readiness`,
    );
}

export async function createConnection(designId: string, connection: Connection): Promise<Connection> {
    return apiJSON<Connection>(`${BASE_URL}/designs/${designId}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connection),
    });
}

export async function deleteConnection(designId: string, connectionId: string): Promise<boolean> {
    const response = await apiFetch(`${BASE_URL}/designs/${designId}/connections/${encodeURIComponent(connectionId)}`, {
        method: 'DELETE',
    });
    if (response.status === 404) return false;
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`${response.status} ${text}`);
    }
    return true;
}

export async function createNet(designId: string, net: ArchitectureNetCreate): Promise<ArchitectureNet> {
    return apiJSON<ArchitectureNet>(`${BASE_URL}/designs/${designId}/nets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(net),
    });
}

export async function updateNet(
    designId: string,
    netId: string,
    patch: ArchitectureNetPatch,
): Promise<ArchitectureNet> {
    return apiJSON<ArchitectureNet>(`${BASE_URL}/designs/${designId}/nets/${encodeURIComponent(netId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    });
}

export async function deleteNet(
    designId: string,
    netId: string,
    mode: NetDeleteMode = 'ungroup',
    targetNetId?: string,
): Promise<ArchitectureNetMutationResponse> {
    const params = new URLSearchParams({ mode });
    if (targetNetId) params.set('target_net_id', targetNetId);
    return apiJSON<ArchitectureNetMutationResponse>(
        `${BASE_URL}/designs/${designId}/nets/${encodeURIComponent(netId)}?${params.toString()}`,
        { method: 'DELETE' },
    );
}

export async function addNetMember(designId: string, netId: string, connectionId: string): Promise<ArchitectureNet> {
    return apiJSON<ArchitectureNet>(`${BASE_URL}/designs/${designId}/nets/${encodeURIComponent(netId)}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId }),
    });
}

export async function removeNetMember(designId: string, netId: string, connectionId: string): Promise<ArchitectureNet> {
    return apiJSON<ArchitectureNet>(
        `${BASE_URL}/designs/${designId}/nets/${encodeURIComponent(netId)}/members/${encodeURIComponent(connectionId)}`,
        { method: 'DELETE' },
    );
}

export async function confirmNet(designId: string, netId: string): Promise<ArchitectureNet> {
    return apiJSON<ArchitectureNet>(`${BASE_URL}/designs/${designId}/nets/${encodeURIComponent(netId)}/confirm`, {
        method: 'POST',
    });
}

export async function rejectNet(designId: string, netId: string): Promise<ArchitectureNet> {
    return apiJSON<ArchitectureNet>(`${BASE_URL}/designs/${designId}/nets/${encodeURIComponent(netId)}/reject`, {
        method: 'POST',
    });
}

export async function mergeNets(designId: string, body: ArchitectureNetMergeBody): Promise<ArchitectureNet> {
    return apiJSON<ArchitectureNet>(`${BASE_URL}/designs/${designId}/nets/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function splitNet(designId: string, netId: string, body: ArchitectureNetSplitBody): Promise<ArchitectureNet> {
    return apiJSON<ArchitectureNet>(`${BASE_URL}/designs/${designId}/nets/${encodeURIComponent(netId)}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function updateNetLayout(designId: string, netId: string, layout: Record<string, unknown>): Promise<ArchitectureNet> {
    return apiJSON<ArchitectureNet>(`${BASE_URL}/designs/${designId}/nets/${encodeURIComponent(netId)}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout }),
    });
}

export async function getArchitectureProposals(
    designId: string,
    status?: string,
): Promise<ArchitectureProposalsResponse> {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return apiJSON<ArchitectureProposalsResponse>(`${BASE_URL}/designs/${designId}/architecture/proposals${suffix}`);
}

export async function applyArchitectureProposal(
    designId: string,
    proposalId: string,
    resultPayload?: Record<string, unknown>,
): Promise<ArchitectureProposalRecord> {
    const result = await apiJSON<{ success: boolean; proposal: ArchitectureProposalRecord }>(
        `${BASE_URL}/designs/${designId}/architecture/proposals/${encodeURIComponent(proposalId)}/apply`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result_payload: resultPayload ?? {} }),
        },
    );
    return result.proposal;
}

export async function applyArchitectureProposalWithResult(
    designId: string,
    proposalId: string,
    resultPayload?: Record<string, unknown>,
): Promise<{ proposal: ArchitectureProposalRecord; connection?: Connection | null }> {
    const result = await apiJSON<{
        success: boolean;
        proposal: ArchitectureProposalRecord;
        connection?: Connection | null;
    }>(
        `${BASE_URL}/designs/${designId}/architecture/proposals/${encodeURIComponent(proposalId)}/apply`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result_payload: resultPayload ?? {} }),
        },
    );
    return { proposal: result.proposal, connection: result.connection ?? null };
}

export async function dismissArchitectureProposal(
    designId: string,
    proposalId: string,
    resultPayload?: Record<string, unknown>,
): Promise<ArchitectureProposalRecord> {
    const result = await apiJSON<{ success: boolean; proposal: ArchitectureProposalRecord }>(
        `${BASE_URL}/designs/${designId}/architecture/proposals/${encodeURIComponent(proposalId)}/dismiss`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ result_payload: resultPayload ?? {} }),
        },
    );
    return result.proposal;
}
export async function saveConnections(designId: string, connections: Connection[]) {
    return apiJSON(`${BASE_URL}/designs/${designId}/connections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connections }),
    });
}

export async function updateConnection(
    designId: string,
    connectionId: string,
    patch: Partial<Connection>,
): Promise<Connection> {
    return apiJSON<Connection>(`${BASE_URL}/designs/${designId}/connections/${connectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    });
}

export async function resolveConnectionPins(designId: string): Promise<ConnectionsResponse> {
    return apiJSON<ConnectionsResponse>(`${BASE_URL}/designs/${designId}/connections/resolve-pins`, {
        method: 'POST',
    });
}

export async function confirmAllConnections(designId: string, workflowId?: string | null, force = false) {
    const url = `${BASE_URL}/designs/${designId}/connections/confirm-all${force ? '?force=true' : ''}`;
    return apiJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId ?? null }),
    });
}

export async function getConnectionReviewStatus(designId: string): Promise<{ pending_review: boolean; workflow_id: string | null }> {
    return apiJSON(`${BASE_URL}/designs/${designId}/connections/review-status`);
}

export async function getPartSpecs(designId: string, _mpn?: string): Promise<Record<string, PartSpecEvidence>> {
    void _mpn;
    return apiJSON<Record<string, PartSpecEvidence>>(`${BASE_URL}/designs/${designId}/parts/specs`);
}

// Phase 7: requirements and subsystems

type RequirementApi = Partial<Requirement>;
type RequirementMutationResponse = Partial<Requirement> & {
    message?: string;
    requirement?: RequirementApi;
    [key: string]: unknown;
};

function normalizeRequirement(req: RequirementApi): Requirement {
    const sourceMpns = req.source_mpns ?? req.bom_reference ?? [];
    return {
        id: req.id ?? req.req_id ?? req.req_key ?? '',
        req_id: req.req_id ?? req.id ?? req.req_key ?? '',
        req_key: req.req_key ?? req.original_req_id ?? null,
        original_req_id: req.req_key ?? req.original_req_id ?? req.req_id ?? req.id ?? '',
        title: req.title ?? req.req_key ?? req.original_req_id ?? 'Requirement',
        description: req.description ?? req.requirement_text ?? '',
        specification: req.specification ?? req.acceptance_criteria ?? '',
        requirement_text: req.requirement_text ?? req.description ?? req.specification ?? '',
        category: req.category ?? 'functional',
        priority: req.priority ?? null,
        source: req.provenance ?? req.source ?? null,
        provenance: req.provenance ?? null,
        rationale: req.rationale ?? null,
        acceptance_criteria: req.acceptance_criteria ?? null,
        verification_method: req.verification_method ?? null,
        verification_status: req.verification_status ?? null,
        status: req.status ?? null,
        source_mpns: sourceMpns,
        source_standards: req.source_standards ?? [],
        bom_reference: sourceMpns,
        quality_warnings: req.quality_warnings ?? [],
        confidence: req.confidence ?? null,
        ai_generated: req.ai_generated ?? false,
        created_at: req.created_at ?? null,
        updated_at: req.updated_at ?? null,
    };
}

function normalizeRequirementsResponse(raw: Partial<RequirementsResponse>): RequirementsResponse {
    const requirements = (raw.requirements ?? []).map(normalizeRequirement);
    const byCategory: Record<string, Requirement[]> = {};
    for (const req of requirements) {
        const category = req.category || 'uncategorized';
        byCategory[category] = [...(byCategory[category] ?? []), req];
    }
    return {
        success: raw.success ?? true,
        accepted: raw.accepted,
        workflow_id: raw.workflow_id ?? null,
        requirements_count: raw.requirements_count ?? raw.total ?? requirements.length,
        total: raw.total ?? requirements.length,
        requirements,
        by_category: raw.by_category ?? byCategory,
        message: raw.message,
        ready_to_continue: raw.ready_to_continue ?? false,
        review_blockers: raw.review_blockers ?? [],
    };
}

export async function generateRequirements(designId: string): Promise<RequirementsResponse> {
    const started = normalizeRequirementsResponse(await apiJSON(`${BASE_URL}/designs/${designId}/requirements/generate`, {
        method: 'POST',
    }));

    if (!started.accepted || !started.workflow_id) {
        return started;
    }

    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 2500));
        const status = await apiJSON<RequirementsStatusResponse>(
            `${BASE_URL}/designs/${designId}/requirements/status/${started.workflow_id}`,
        );
        if (!status.available || status.error || status.last_error || status.current_stage === 'failed') {
            throw new Error(status.last_error || status.error || 'Requirements generation status is unavailable');
        }
        if (status.current_stage === 'complete') {
            return getRequirementsGET(designId);
        }
    }

    throw new Error('Requirements generation is still running. Refresh the page in a moment.');
}

export async function getRequirements(designId: string): Promise<RequirementsResponse> {
    return getRequirementsGET(designId);
}

export async function getRequirementsGET(designId: string): Promise<RequirementsResponse> {
    return normalizeRequirementsResponse(await apiJSON(`${BASE_URL}/designs/${designId}/requirements`));
}

export async function getRequirementDetail(designId: string, reqId: string): Promise<RequirementDetailResponse> {
    const result = await apiJSON<RequirementApi & {
        history?: RequirementHistoryEvent[];
        sources?: RequirementSourceEvidence[];
    }>(`${BASE_URL}/designs/${designId}/requirements/${encodeURIComponent(reqId)}`);
    return {
        ...normalizeRequirement(result),
        history: result.history ?? [],
        sources: result.sources ?? [],
    };
}

export async function getRequirementsTraceability(designId: string): Promise<TraceabilityMatrixResponse> {
    return apiJSON<TraceabilityMatrixResponse>(`${BASE_URL}/designs/${designId}/requirements/traceability`);
}

export async function updateRequirement(
    designId: string,
    reqId: string,
    dataOrDescription: Partial<Requirement> | string,
    category?: string | null,
    bomReference?: string[],
    _setStage?: (stage: number | null) => void,
) {
    void _setStage;
    const data: Partial<Requirement> = typeof dataOrDescription === 'string'
        ? {
            description: dataOrDescription,
            requirement_text: dataOrDescription,
            category: category ?? undefined,
            source_mpns: bomReference,
            bom_reference: bomReference,
        }
        : dataOrDescription;

    const result = await apiJSON<RequirementMutationResponse>(`${BASE_URL}/designs/${designId}/requirements/${encodeURIComponent(reqId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: data.title,
            description: data.description ?? data.requirement_text,
            specification: data.specification,
            category: data.category,
            priority: data.priority,
            rationale: data.rationale,
            acceptance_criteria: data.acceptance_criteria,
            verification_method: data.verification_method,
            verification_status: data.verification_status,
            source_mpns: data.source_mpns ?? data.bom_reference,
            source_standards: data.source_standards,
        }),
    });
    return {
        ...result,
        message: result.message ?? 'Requirement updated successfully',
        requirement: normalizeRequirement(result.requirement ?? result),
    };
}

export async function deleteRequirement(designId: string, reqId: string) {
    return apiJSON(`${BASE_URL}/designs/${designId}/requirements/${encodeURIComponent(reqId)}`, {
        method: 'DELETE',
    });
}

export async function confirmRequirement(designId: string, reqId: string) {
    const result = await apiJSON<RequirementMutationResponse>(`${BASE_URL}/designs/${designId}/requirements/${encodeURIComponent(reqId)}/confirm`, {
        method: 'POST',
    });
    return {
        ...result,
        requirement: normalizeRequirement(result.requirement ?? result),
    };
}

export async function rejectRequirement(designId: string, reqId: string, reason: string) {
    return apiJSON(`${BASE_URL}/designs/${designId}/requirements/${encodeURIComponent(reqId)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
    });
}

export async function proposeRequirementEdit(designId: string, reqId: string, action: string) {
    const result = await apiJSON<{ success: boolean; proposal: RequirementProposal }>(
        `${BASE_URL}/designs/${designId}/requirements/${encodeURIComponent(reqId)}/ai/propose`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        },
    );
    return result.proposal;
}

export async function applyRequirementProposal(designId: string, proposalId: string) {
    return apiJSON<{ success: boolean; proposal_id: string; status: string }>(
        `${BASE_URL}/designs/${designId}/requirements/proposals/${encodeURIComponent(proposalId)}/apply`,
        { method: 'POST' },
    );
}

export async function createRequirement(designId: string, data: Partial<Requirement>) {
    const result = await apiJSON<RequirementMutationResponse>(`${BASE_URL}/designs/${designId}/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: data.title,
            description: data.description ?? data.requirement_text,
            specification: data.specification,
            category: data.category,
            priority: data.priority ?? 'must_have',
            source_mpns: data.source_mpns ?? data.bom_reference ?? [],
            source_standards: data.source_standards ?? [],
            verification_method: data.verification_method,
            acceptance_criteria: data.acceptance_criteria,
        }),
    });
    return {
        ...result,
        requirement: normalizeRequirement(result.requirement ?? result),
    };
}

export async function confirmAllRequirements(designId: string) {
    return apiJSON(`${BASE_URL}/designs/${designId}/requirements/confirm-all`, {
        method: 'POST',
    });
}
export interface SubsystemSummary {
    id: string;
    subsystem_id: string;
    subsystem_key?: string | null;
    name: string;
    type: string;
    original_subsystem_id: string;
    description?: string | null;
    status?: 'suggested' | 'confirmed' | 'rejected' | string;
    confidence?: number | null;
    rationale?: string | null;
    warnings?: string[];
    diagnostic_warnings?: string[];
    evidence?: {
        part_count?: number;
        internal_connection_count?: number;
        shared_net_count?: number;
        requirement_overlap_count?: number;
        interface_count?: number;
        functional_roles?: string[];
    };
    topology?: string | null;
    topology_family?: string | null;
    componentIds?: string[];
    mpns?: string[];
    bom_reference: string[];
    parts: SubsystemPartDetail[];
    requirements?: SubsystemRequirementItem[];
    interfaces?: SubsystemConnection[];
    user_corrected?: boolean;
    ai_generated?: boolean;
    [key: string]: unknown;
}

export interface SubsystemsResponse {
    subsystems: SubsystemSummary[];
    subsystems_count?: number;
    connections?: SubsystemConnection[];
}

export interface SubsystemCreatePayload {
    name: string;
    description?: string | null;
    topology?: string | null;
    topology_family?: string | null;
}

export interface SubsystemMergePayload {
    source_subsystem_ids: string[];
    target_subsystem_id?: string | null;
    target_name?: string | null;
}

export interface SubsystemSplitGroupPayload {
    name: string;
    part_ids: string[];
    description?: string | null;
    topology?: string | null;
    topology_family?: string | null;
}

export interface SubsystemSplitPayload {
    groups: SubsystemSplitGroupPayload[];
}

export interface SubsystemRequirementCoverageResponse {
    design_id: string;
    design_requirements: Array<Requirement & {
        linked_subsystem_requirements: SubsystemRequirementItem[];
        linked_count: number;
    }>;
    uncovered_requirements: Array<Requirement & {
        linked_subsystem_requirements: SubsystemRequirementItem[];
        linked_count: number;
    }>;
    stale_subsystem_requirements: SubsystemRequirementItem[];
    counts: {
        confirmed_design_requirements: number;
        covered_design_requirements: number;
        uncovered_design_requirements: number;
        stale_subsystem_requirements: number;
        [key: string]: number;
    };
}

export interface SubsystemPartDetail {
    design_part_id?: string | null;
    part_number: string;
    mpn?: string | null;
    component_id?: string | null;
    designator?: string | null;
    category?: string | null;
    classification?: string | null;
    description?: string | null;
    manufacturer?: string | null;
    quantity?: number | null;
    datasheet_url?: string | null;
    specs?: Record<string, unknown> & { params?: PartParams | null };
    [key: string]: unknown;
}

export type SubsystemDetailsResponse = SubsystemSummary & {
    parts: SubsystemPartDetail[];
};

export type SubsystemRequirementsResponse =
    | { detail: string }
    | { requirements: SubsystemRequirementItem[] }
    | { subsystem_requirements: Array<{ subsystem_id: string; requirements?: SubsystemRequirementItem[] }> }
    | { requirements_by_subsystem: Record<string, SubsystemRequirementItem[]>; all_requirements?: SubsystemRequirementItem[] };

export type GenerateSubsystemRequirementsResponse =
    | { requirements: SubsystemRequirementItem[] }
    | { requirements_by_subsystem: Record<string, SubsystemRequirementItem[]> }
    | { all_requirements: SubsystemRequirementItem[] };

export interface SubsystemReadinessItem {
    type: string;
    id: string | null;
    label: string;
    severity: 'blocking' | 'warning';
    payload: Record<string, unknown>;
}

export interface SubsystemReadinessResponse {
    can_complete: boolean;
    counts: {
        subsystems: number;
        suggested_subsystems: number;
        confirmed_subsystems: number;
        unassigned_important_parts: number;
        duplicate_important_parts: number;
        unallocated_requirements: number;
        [key: string]: number;
    };
    blockers: SubsystemReadinessItem[];
    warnings?: SubsystemReadinessItem[];
}

export type SubsystemReviewProposalStatus = 'pending' | 'applied' | 'dismissed' | 'invalid';
export type SubsystemReviewProposalType =
    | 'rename_subsystem'
    | 'move_part'
    | 'merge_subsystems'
    | 'split_subsystem'
    | 'create_interface_requirement'
    | 'flag_weak_member'
    | 'flag_unmapped_requirement'
    | 'flag_duplicate_name';

export interface SubsystemReviewProposal {
    id: string;
    design_id: string;
    proposal_type: SubsystemReviewProposalType;
    status: SubsystemReviewProposalStatus;
    title: string;
    description?: string | null;
    rationale?: string | null;
    payload: Record<string, unknown>;
    validation_errors: string[];
    source: 'langgraph' | 'manual' | 'system' | string;
    confidence?: number | null;
    dismissed_reason?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    applied_at?: string | null;
    dismissed_at?: string | null;
}

export interface SubsystemReviewProposalsResponse {
    design_id: string;
    proposals: SubsystemReviewProposal[];
    count: number;
    trace?: string[];
}

export async function generateSubsystems(designId: string): Promise<SubsystemsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/generate`, {
        method: 'POST',
    });
}

export async function getSubsystems(designId: string): Promise<SubsystemsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems`);
}

export async function getSubsystemDetails(designId: string, subsystemId: string): Promise<SubsystemDetailsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/${encodeURIComponent(subsystemId)}`);
}

export async function createSubsystem(
    designId: string,
    payload: SubsystemCreatePayload,
): Promise<SubsystemDetailsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function confirmSubsystem(designId: string, subsystemId: string): Promise<SubsystemDetailsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/${encodeURIComponent(subsystemId)}/confirm`, {
        method: 'POST',
    });
}

export async function rejectSubsystem(designId: string, subsystemId: string): Promise<SubsystemDetailsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/${encodeURIComponent(subsystemId)}/reject`, {
        method: 'POST',
    });
}

export async function updateSubsystem(
    designId: string,
    subsystemId: string,
    payload: {
        name?: string | null;
        description?: string | null;
        topology?: string | null;
        topology_family?: string | null;
    },
): Promise<SubsystemDetailsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/${encodeURIComponent(subsystemId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function moveSubsystemPart(
    designId: string,
    designPartId: string,
    targetSubsystemId: string,
    sourceSubsystemId?: string | null,
): Promise<SubsystemsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/parts/${encodeURIComponent(designPartId)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            target_subsystem_id: targetSubsystemId,
            source_subsystem_id: sourceSubsystemId || undefined,
        }),
    });
}

export async function addSubsystemPart(
    designId: string,
    subsystemId: string,
    designPartId: string,
): Promise<SubsystemDetailsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/${encodeURIComponent(subsystemId)}/parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design_part_id: designPartId }),
    });
}

export async function removeSubsystemPart(
    designId: string,
    subsystemId: string,
    designPartId: string,
): Promise<SubsystemDetailsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/${encodeURIComponent(subsystemId)}/parts/${encodeURIComponent(designPartId)}`, {
        method: 'DELETE',
    });
}

export async function mergeSubsystems(
    designId: string,
    payload: SubsystemMergePayload,
): Promise<SubsystemsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function splitSubsystem(
    designId: string,
    subsystemId: string,
    payload: SubsystemSplitPayload,
): Promise<SubsystemsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/${encodeURIComponent(subsystemId)}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function updateSubsystemInterface(
    designId: string,
    interfaceId: string,
    payload: {
        name?: string | null;
        interface_type?: string | null;
        signal_type?: string | null;
        direction?: string | null;
        description?: string | null;
        constraints_json?: Record<string, unknown> | null;
        verification_method?: string | null;
        rationale?: string | null;
        confidence?: number | null;
    },
): Promise<SubsystemConnection> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/interfaces/${encodeURIComponent(interfaceId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function getSubsystemInterfaces(designId: string): Promise<{ interfaces: SubsystemInterfaceContract[]; count: number }> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/interfaces`);
}

export async function getSubsystemInterface(
    designId: string,
    interfaceId: string,
): Promise<SubsystemInterfaceContract> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/interfaces/${encodeURIComponent(interfaceId)}`);
}

export async function confirmSubsystemInterface(
    designId: string,
    interfaceId: string,
): Promise<SubsystemConnection> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/interfaces/${encodeURIComponent(interfaceId)}/confirm`, {
        method: 'POST',
    });
}

export async function rejectSubsystemInterface(
    designId: string,
    interfaceId: string,
): Promise<SubsystemConnection> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/interfaces/${encodeURIComponent(interfaceId)}/reject`, {
        method: 'POST',
    });
}

export async function getSubsystemInterfaceEvidence(
    designId: string,
    interfaceId: string,
): Promise<{ interface_id: string; evidence: SubsystemInterfaceEvidence[] }> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/interfaces/${encodeURIComponent(interfaceId)}/evidence`);
}

export async function getSubsystemPorts(designId: string): Promise<{ ports: SubsystemPort[] }> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/ports`);
}

export async function getSubsystemReadiness(designId: string): Promise<SubsystemReadinessResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/readiness`);
}

export async function suggestSubsystemReview(designId: string): Promise<SubsystemReviewProposalsResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/review/suggest`, {
        method: 'POST',
    });
}

export async function getSubsystemReviewProposals(
    designId: string,
    status?: SubsystemReviewProposalStatus,
): Promise<SubsystemReviewProposalsResponse> {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/review/proposals${suffix}`);
}

export async function applySubsystemReviewProposal(
    designId: string,
    proposalId: string,
): Promise<{ proposal: SubsystemReviewProposal; readiness: SubsystemReadinessResponse }> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/review/proposals/${encodeURIComponent(proposalId)}/apply`, {
        method: 'POST',
    });
}

export async function dismissSubsystemReviewProposal(
    designId: string,
    proposalId: string,
    reason?: string,
): Promise<{ proposal: SubsystemReviewProposal }> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/review/proposals/${encodeURIComponent(proposalId)}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
    });
}

export async function completeSubsystemArchitecture(designId: string): Promise<SubsystemReadinessResponse & { success: boolean; fsm_state: string }> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/complete`, {
        method: 'POST',
    });
}

export async function getSubsystemRequirementCoverage(designId: string): Promise<SubsystemRequirementCoverageResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/requirements/coverage`);
}

export async function regenerateStaleSubsystemRequirements(designId: string): Promise<{
    design_id: string;
    subsystems_processed: number;
    results: Record<string, { skipped?: boolean; reason?: string | null; requirements?: SubsystemRequirementItem[] }>;
    requirements_by_subsystem: Record<string, SubsystemRequirementItem[]>;
}> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/requirements/regenerate-stale`, {
        method: 'POST',
    });
}

export async function getSubsystemRequirementsBySubsystemId(
    designId: string,
    subsystemId: string,
): Promise<{ subsystem_id: string; requirements: SubsystemRequirementItem[] }> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/${subsystemId}/requirements`);
}

export async function getAllSubsystemRequirements(designId: string): Promise<{
    design_id: string;
    requirements_count: number;
    requirements_by_subsystem: Record<string, SubsystemRequirementItem[]>;
    all_requirements: SubsystemRequirementItem[];
}> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/requirements`);
}

export async function generateSubsystemRequirements(
    designId: string,
    subsystemId: string,
): Promise<{
    subsystem_id: string;
    generated_count: number;
    skipped: boolean;
    requirements: SubsystemRequirementItem[];
}> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/${subsystemId}/requirements/generate`, {
        method: 'POST',
    });
}

export async function generateAllSubsystemRequirements(designId: string): Promise<{
    design_id: string;
    subsystems_processed: number;
    results: Record<string, { skipped: boolean; reason: string | null; requirements: SubsystemRequirementItem[] }>;
    requirements_by_subsystem: Record<string, SubsystemRequirementItem[]>;
}> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/requirements/generate-all`, {
        method: 'POST',
    });
}

export async function createSubsystemRequirement(
    designId: string,
    subsystemIdOrData: string | Partial<SubsystemRequirementItem>,
    data?: Partial<SubsystemRequirementItem>,
): Promise<{ success: boolean; requirement: SubsystemRequirementItem }> {
    const subsystemId = typeof subsystemIdOrData === 'string'
        ? subsystemIdOrData
        : String(subsystemIdOrData.subsystem_id ?? '');
    const payload = typeof subsystemIdOrData === 'string' ? data : subsystemIdOrData;
    const body = {
        title: payload?.title ?? null,
        description: payload?.description ?? payload?.requirement_text ?? '',
        priority: payload?.priority ?? 'must_have',
        rationale: payload?.rationale ?? null,
        acceptance_criteria: payload?.acceptance_criteria ?? null,
        verification_method: payload?.verification_method ?? null,
        parent_req_id: payload?.parent_req_id ?? null,
        criteria_json: payload?.criteria_json ?? null,
        source_mpns: payload?.source_mpns ?? [],
        parts: payload?.mapped_part_ids ?? [],
        confidence: payload?.confidence ?? null,
    };
    const requirement = await apiJSON<SubsystemRequirementItem>(
        `${BASE_URL}/designs/${designId}/subsystems/${subsystemId}/requirements`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        },
    );
    return { success: true, requirement };
}

export async function updateSubsystemRequirement(
    designId: string,
    reqId: string,
    fields: Partial<SubsystemRequirementItem>,
): Promise<SubsystemRequirementItem> {
    const body: Record<string, unknown> = {};
    if (fields.title !== undefined) body.title = fields.title;
    if (fields.description !== undefined) body.description = fields.description;
    if (fields.priority !== undefined) body.priority = fields.priority;
    if (fields.rationale !== undefined) body.rationale = fields.rationale;
    if (fields.acceptance_criteria !== undefined) body.acceptance_criteria = fields.acceptance_criteria;
    if (fields.verification_method !== undefined) body.verification_method = fields.verification_method;
    if (fields.parent_req_id !== undefined) body.parent_req_id = fields.parent_req_id;
    if (fields.criteria_json !== undefined) body.criteria_json = fields.criteria_json;
    if (fields.source_mpns !== undefined) body.source_mpns = fields.source_mpns;
    if (fields.mapped_part_ids !== undefined) body.parts = fields.mapped_part_ids;
    if (fields.confidence !== undefined) body.confidence = fields.confidence;
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/requirements/${reqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

export async function confirmSubsystemRequirement(
    designId: string, reqId: string,
): Promise<SubsystemRequirementItem> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/requirements/${reqId}/confirm`, {
        method: 'POST',
    });
}

export async function rejectSubsystemRequirement(
    designId: string, reqId: string,
): Promise<SubsystemRequirementItem> {
    return apiJSON(`${BASE_URL}/designs/${designId}/subsystems/requirements/${reqId}/reject`, {
        method: 'POST',
    });
}

export async function deleteSubsystemRequirement(
    designId: string, reqId: string,
): Promise<void> {
    const res = await apiFetch(`${BASE_URL}/designs/${designId}/subsystems/requirements/${reqId}`, {
        method: 'DELETE',
    });
    if (!res.ok && res.status !== 204) {
        const text = await res.text();
        throw new Error(`Delete subsystem requirement failed: ${res.status} ${text}`);
    }
}

// ── Review (final roll-up + complete) ────────────────────────────────────────

export interface ReviewSubsystem {
    subsystem_id: string;
    subsystem_key?: string | null;
    name: string;
    description?: string | null;
    status: string;
    topology?: string | null;
    topology_family?: string | null;
    confidence?: number | null;
    user_corrected: boolean;
    ai_generated: boolean;
    part_count: number;
    parts: Array<{
        design_part_id: string; mpn: string | null; designator: string | null;
        manufacturer: string | null; category: string | null; classification: string | null;
        instance_function: string | null; quantity: number; identification_status: string | null;
    }>;
    requirements: SubsystemRequirementItem[];
}

export interface ReviewResponse {
    design_id: string;
    project_name: string | null;
    fsm_state: string;
    is_complete: boolean;
    can_complete: boolean;
    completion_readiness?: {
        can_complete: boolean;
        counts: Record<string, number>;
        blockers: SubsystemReadinessItem[];
    };
    completion_blockers?: SubsystemReadinessItem[];
    system_profile: {
        system_type: string | null;
        primary_function: string | null;
        architectural_clues: unknown;
        application_domains: unknown;
    };
    standards: string[];
    parts_summary: {
        total: number;
        by_classification: Record<string, number>;
        parts: ReviewSubsystem['parts'];
    };
    subsystems: ReviewSubsystem[];
    subsystem_count: number;
    interfaces_count: number;
    connections: { total: number; by_status: Record<string, number> };
    design_requirements: {
        total: number;
        by_status: Record<string, number>;
        items: Array<{
            req_id: string; req_key?: string | null; title?: string | null;
            description?: string | null; category?: string | null; priority?: string | null;
            status: string; ai_generated?: boolean; confidence?: number | null;
            verification_method?: string | null;
            child_subsystem_req_count: number; child_subsystem_req_ids: string[];
            child_subsystem_requirements?: Array<{
                req_id: string;
                req_key?: string | null;
                title?: string | null;
                status: string;
                subsystem_id: string;
                subsystem_name?: string | null;
                interface_id?: string | null;
                interface_label?: string | null;
                stale?: boolean;
            }>;
        }>;
    };
    interfaces?: {
        total: number;
        by_status: Record<string, number>;
        stale: number;
        items: SubsystemInterfaceContract[];
    };
    subsystem_requirements: {
        total: number;
        by_status: Record<string, number>;
        with_parent: number;
        stale: number;
    };
}

export type DesignLens = 'architecture' | 'requirements' | 'subsystems' | 'interfaces' | 'review';

export type SelectedEntity =
    | { type: 'part'; id: string }
    | { type: 'connection'; id: string }
    | { type: 'subsystem'; id: string }
    | { type: 'interface'; id: string }
    | { type: 'requirement'; id: string }
    | { type: 'subsystem_requirement'; id: string };

export interface DesignDefinitionReviewItem {
    id: string | null;
    type: string;
    label: string;
    severity: 'blocking' | 'warning';
    source: 'architecture' | 'subsystems' | 'final_review';
    payload: Record<string, unknown>;
    focus?: {
        entity_type: SelectedEntity['type'];
        entity_id: string;
        lens: DesignLens;
    };
}

export interface DesignDefinitionResponse {
    design_id: string;
    fsm_state: string;
    is_complete: boolean;
    can_complete: boolean;
    review: ReviewResponse;
    parts: ReviewSubsystem['parts'];
    connections: Connection[];
    nets: ArchitectureNet[];
    subsystems: ReviewSubsystem[];
    interfaces: SubsystemInterfaceContract[];
    ports: SubsystemPort[];
    design_requirements: NonNullable<ReviewResponse['design_requirements']['items']>;
    subsystem_requirements: ReviewResponse['subsystem_requirements'];
    readiness: {
        architecture: ArchitectureCompletionReadiness;
        subsystems: SubsystemReadinessResponse;
        final_review: NonNullable<ReviewResponse['completion_readiness']>;
    };
    review_items: DesignDefinitionReviewItem[];
}

export async function getReview(designId: string): Promise<ReviewResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/review`);
}

export async function getDesignDefinition(designId: string): Promise<DesignDefinitionResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/definition`);
}

export async function markDesignComplete(designId: string): Promise<{
    design_id: string;
    fsm_state: string;
    already_complete: boolean;
}> {
    return apiJSON(`${BASE_URL}/designs/${designId}/pipeline/complete`, { method: 'POST' });
}

// Phase 4+ types (stubs filled in as phases complete).

export async function sendChatMessage(designId: string, message: string): Promise<{ data: string }> {
    return apiJSON(`${BASE_URL}/designs/${designId}/pipeline/analyze/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
    });
}

export async function chatStream(
    _designId: string,
    _message: string,
    _onEvent: (event: ChatStreamEvent) => void,
    _pageContext?: string,
): Promise<void> {
    void _designId;
    void _message;
    void _onEvent;
    void _pageContext;
    console.warn('[api] chatStream: Chat not yet implemented');
}

export async function getChatHistory(_designId: string, _limit = 50): Promise<ChatHistoryResponse> {
    void _designId;
    void _limit;
    console.warn('[api] getChatHistory: Chat not yet implemented');
    return { messages: [] };
}

// Part model APIs

export interface PartModelResponse {
    mpn: string;
    model: import('@/app/types').PartModelData;
    extracted_at: string;
}

export interface PartPinoutResponse {
    mpn: string;
    package: string | null;
    pin_count: number;
    pins: import('@/app/types').PartPin[];
    confidence: number;
}

export interface PartPinoutsResponse {
    pinouts: Record<string, PartPinoutResponse>;
    missing: string[];
}

export interface ModelExtractionResponse {
    mpn: string;
    status: 'already_extracted' | 'extraction_started';
    model?: import('@/app/types').PartModelData;
    extracted_at?: string;
}

export async function getPartModel(designId: string, mpn: string): Promise<PartModelResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/parts/${encodeMpn(mpn)}/model`);
}

export async function getPartPinout(designId: string, mpn: string): Promise<PartPinoutResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/parts/${encodeMpn(mpn)}/pinout`);
}

export async function getPartPinouts(designId: string, mpns: string[]): Promise<PartPinoutsResponse> {
    const params = new URLSearchParams();
    for (const mpn of mpns) {
        if (mpn) params.append('mpns', mpn);
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return apiJSON(`${BASE_URL}/designs/${designId}/parts/pinouts${suffix}`);
}

export async function triggerModelExtraction(designId: string, mpn: string): Promise<ModelExtractionResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/parts/${encodeMpn(mpn)}/model/extract`, { method: 'POST' });
}

// Model enrichment stage

export interface ModelEnrichmentTriggerResponse {
    status: 'enrichment_started' | 'nothing_to_enrich';
    total?: number;
    workflow_id?: string | null;
}

export type PartEnrichmentState = 'done' | 'extracting' | 'no_datasheet' | 'failed';

export interface PartEnrichmentDetail {
    mpn: string;
    status: PartEnrichmentState;
    has_model: boolean;
    datasheet_url?: string | null;
    datasheet_source?: string | null;
    source: string | null;
    failure_reason: string | null;
}

export interface ModelEnrichmentStatus {
    total: number;
    done: number;
    extracting: number;
    failed: number;
    no_datasheet: number;
    complete: boolean;
    parts: PartEnrichmentDetail[];
}

export async function triggerModelEnrichment(designId: string): Promise<ModelEnrichmentTriggerResponse> {
    return apiJSON(`${BASE_URL}/designs/${designId}/pipeline/enrich`, { method: 'POST' });
}

export async function getModelEnrichmentStatus(designId: string): Promise<ModelEnrichmentStatus> {
    return apiJSON(`${BASE_URL}/designs/${designId}/enrichment/status`);
}

export async function updatePartDatasheetUrl(
    designId: string,
    mpn: string,
    url: string,
): Promise<{ status: string; mpn: string }> {
    return apiJSON(`${BASE_URL}/designs/${designId}/parts/${encodeMpn(mpn)}/datasheet-url`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
    });
}

export async function reIdentifyPart(
    designId: string,
    mpn: string,
): Promise<{ status: string; mpn: string }> {
    return apiJSON(`${BASE_URL}/designs/${designId}/parts/${encodeMpn(mpn)}/re-identify`, {
        method: 'POST',
    });
}

export interface NexarRefreshResult {
    mpn: string;
    manufacturer: string | null;
    category: string | null;
    description: string | null;
    datasheet_url: string | null;
    source: string;
    params: PartParams | null;
}

export async function nexarRefreshPart(
    designId: string,
    mpn: string,
): Promise<NexarRefreshResult> {
    return apiJSON(`${BASE_URL}/designs/${designId}/parts/${encodeMpn(mpn)}/nexar-refresh`, {
        method: 'POST',
    });
}
