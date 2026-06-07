// Core Types for BOM Evolution Platform
// Updated: Force rebuild

export type SessionStage = 'overview' | 'upload' | 'discovery' | 'validate' | 'part-identification' | 'system-identification' | 'classification' | 'enrichment' | 'architecture' | 'requirements' | 'subsystems' | 'compliance' | 'review';

export type ComplianceStatus = 'compliant' | 'failed' | 'partial' | 'unknown';

export type FailureType = 'UNDERSPEC' | 'GAP' | 'OVERSPEC' | 'INCOMPATIBLE';

export interface Component {
  id: string;
  reference: string; // e.g., "LDO_3V3_DIGITAL"
  partNumber?: string; // e.g., "TPS7A4700"
  manufacturer?: string;
  type: string; // e.g., "secondary_regulator"
  description: string;

  // Specifications
  specs: {
    voltage?: number;
    current?: number;
    efficiency?: number;
    temperature_min?: number;
    temperature_max?: number;
    noise?: number;
    features?: string[];
    [key: string]: unknown;
  };

  // Identification status
  isIdentified: boolean;
  isGeneric: boolean;

  // Classification
  isFundamental?: boolean; // true = essential, false = auxiliary, undefined = not classified

  // Compliance
  complianceStatus: ComplianceStatus;
  complianceScore?: number;
  failedRequirements?: string[];

  // Visual positioning for canvas
  position?: { x: number; y: number };
  subsystemId?: string;
  subsystemName?: string;
  subsystemKey?: string | null;
  subsystemColor?: string;
  subsystemWarning?: boolean;

  // Pinout information (for ICs and components with defined pins)
  pinout?: Record<string, { name: string; type: string; description: string }>;
}

export interface Requirement {
  id: string;
  code: string; // e.g., "REQ-PWR-003"
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'mandatory' | 'medium' | 'low';
  category: string; // e.g., "Power", "Safety", "Environmental"

  // Validation
  validationType: 'threshold' | 'boolean' | 'range' | 'enum';
  expectedValue?: unknown;
  threshold?: number;
  operator?: '>=' | '<=' | '=' | '!=' | '>' | '<';

  // Status
  isPassed: boolean;
  affectedComponents: string[]; // Component IDs
}

export interface RequirementFailure {
  requirementId: string;
  requirementCode: string;
  componentId: string;
  failureType: FailureType;
  actualValue?: unknown;
  expectedValue?: unknown;
  description: string;
}

export interface SubsystemPart {
  design_part_id?: string | null;
  part_number?: string | null;
  mpn?: string | null;
  component_id?: string | null;
  designator?: string | null;
  category?: string | null;
  classification?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  quantity?: number | null;
  datasheet_url?: string | null;
  source?: string | null;
  user_corrected?: boolean | null;
}

export interface SubsystemMappedRequirement {
  id?: string;
  req_id?: string;
  req_key?: string | null;
  title?: string | null;
  description?: string | null;
  requirement_text?: string | null;
  source_mpns?: string[];
}

export interface SubsystemInterfaceSummary {
  id?: string | null;
  name?: string | null;
  source_subsystem_id?: string;
  target_subsystem_id?: string;
  source_port_id?: string | null;
  target_port_id?: string | null;
  source_subsystem?: string;
  target_subsystem?: string;
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
  evidence_count?: number;
  linked_requirements_count?: number;
  primary_type?: string | null;
  description?: string | null;
  connection_types?: string[];
  part_connection_count?: number;
}

export interface Subsystem {
  id: string;
  name: string;
  type: string; // e.g., "Power Subsystem", "Communication Subsystem"
  componentIds: string[];
  complianceScore?: number;
  position?: { x: number; y: number };
  subsystem_id?: string;
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
  parts?: SubsystemPart[];
  requirements?: SubsystemMappedRequirement[];
  subsystem_requirements?: import('@/app/services/api').SubsystemRequirementItem[];
  subsystem_requirements_count?: number;
  interfaces?: SubsystemInterfaceSummary[];
  user_corrected?: boolean;
  ai_generated?: boolean;
  subsystem_key?: string | null;
  original_subsystem_id?: string | null;
  mpns?: string[];
}

export interface Alternative {
  id: string;
  partNumber: string;
  manufacturer: string;
  description: string;
  complianceScore: number;
  complianceStatus: ComplianceStatus;

  specs: {
    voltage?: string | number;
    current?: string | number;
    [key: string]: unknown;
  };

  // Comparison metrics
  efficiency?: number;
  cost?: number;
  noise?: number;
  improvements: string[];
  failedRequirements: RequirementFailure[];

  // Impact analysis
  impact: {
    complianceChange: number;
    costChange: number;
    isDropInReplacement: boolean;
  };

  isRecommended?: boolean;
  confidence?: number;
  datasheetUrl?: string;
}

export interface BOMSession {
  id: string;
  name: string;
  systemType?: string; // e.g., "Power Supply", "IoT Device"
  version: number;
  stage: SessionStage;

  // Data
  components: Component[];
  requirements: Requirement[];
  subsystems: Subsystem[];

  // Overall metrics
  complianceScore?: number;
  totalComponents: number;
  compliantComponents: number;

  // Timeline
  createdAt: Date;
  updatedAt: Date;

  // State
  selectedComponentId?: string;
  exploringAlternatives?: boolean;
}

export interface BOMUploadData {
  fileName: string;
  rowCount: number;
  columns: string[];
  preview: Record<string, unknown>[];
}

export interface IdentificationResult {
  componentId: string;
  success: boolean;
  partNumber?: string;
  manufacturer?: string;
  specs?: Record<string, unknown>;
  datasheetUrl?: string;
  error?: string;
}

// ── Part Model types ──────────────────────────────────────────────────────────
// Field names mirror the backend Pydantic classes in model_extraction_service.py exactly.

export type PinDirection = 'input' | 'output' | 'bidirectional' | 'power' | 'ground' | 'analog' | 'nc';
export type LogicFamily = 'push_pull' | 'open_drain' | 'ttl' | 'cmos' | 'analog' | 'power';
export type InterfaceRole = 'master' | 'slave' | 'either';

export interface PartPin {
  number: string;
  name: string;
  direction: PinDirection;      // matches Pin.direction (not "type")
  function: string;              // matches Pin.function (not "description")
  voltage_domain: string | null;
  logic_family: LogicFamily | null;
  voltage_level: string | null;
  protocols: string[];
  pull: string | null;
  notes: string | null;
}

export interface PartInterface {
  type: string;
  instance: string;              // matches Interface.instance (not "name")
  role: InterfaceRole | null;
  pins: string[];
  voltage_domain: string | null;
  max_speed: string | null;
  address: string | null;
  channels: number | null;
  notes: string | null;
}

export interface PowerDomain {
  name: string;
  voltage_min: number | null;
  voltage_typ: number | null;
  voltage_max: number | null;
  supply_pins: string[];
  required_decoupling: string[];  // List[str] in backend, not string | null
  quiescent_current_typ: string | null;
  notes: string | null;
}

export interface PartPowerProfile {
  power_domains: PowerDomain[];
  active_current_typ: string | null;   // matches PowerProfile.active_current_typ
  sleep_current_typ: string | null;    // matches PowerProfile.sleep_current_typ
}

export interface PartSpec {
  name: string;
  value: string;
  units: string | null;          // matches Spec.units (not "unit")
  conditions: string | null;
}

export interface ConnectivityConstraint {
  applies_to: string;            // matches ConnectivityConstraint.applies_to
  requirement: string;
  reason: string | null;
  schematic_note: string | null;
}

export interface CompatibleDevice {
  category: string;
  interface: string | null;      // Optional in backend
  note: string | null;
}

export interface PartModelData {
  interfaces: PartInterface[];
  power: PartPowerProfile;
  key_specs: PartSpec[];
  absolute_max: PartSpec[];             // List[Spec] in backend
  constraints: ConnectivityConstraint[]; // List[ConnectivityConstraint] in backend
  typical_application_notes: string[];
  compatible_with: CompatibleDevice[];
}
