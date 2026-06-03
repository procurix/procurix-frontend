import { useState, useEffect } from 'react';
import { X, Loader2, Zap, Cpu, Activity, AlertTriangle, ChevronRight, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getPartModel, getPartPinout, triggerModelExtraction } from '@/app/services/api';
import type { PartModelData, PartPin, ConnectivityConstraint, PartSpec } from '@/app/types';

// ── Props ─────────────────────────────────────────────────────────────────────

interface PartModelDrawerProps {
    mpn: string;
    designId: string;
    isOpen: boolean;
    onClose: () => void;
    side?: 'left' | 'right';
}

// ── State ─────────────────────────────────────────────────────────────────────

type DrawerState =
    | { phase: 'loading' }
    | { phase: 'not_extracted' }
    | { phase: 'extracting' }
    | { phase: 'ready'; model: PartModelData; extractedAt: string }
    | { phase: 'error'; message: string };

type PinsState =
    | { phase: 'idle' }
    | { phase: 'loading' }
    | { phase: 'ready'; pins: PartPin[]; pkg: string | null }
    | { phase: 'error' };

type Tab = 'overview' | 'pins' | 'interfaces' | 'power' | 'specs';

const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'pins', label: 'Pins' },
    { id: 'interfaces', label: 'Interfaces' },
    { id: 'power', label: 'Power' },
    { id: 'specs', label: 'Specs' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function DirectionChip({ direction }: { direction: string }) {
    const styles: Record<string, string> = {
        power: 'bg-red-50 text-red-700 border-red-200',
        ground: 'bg-gray-100 text-gray-600 border-gray-300',
        input: 'bg-blue-50 text-blue-700 border-blue-200',
        output: 'bg-green-50 text-green-700 border-green-200',
        bidirectional: 'bg-purple-50 text-purple-700 border-purple-200',
        analog: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        nc: 'bg-gray-50 text-gray-400 border-gray-200',
    };
    return (
        <span className={`text-[10px] border px-1.5 py-0.5 rounded font-medium ${styles[direction] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
            {direction}
        </span>
    );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function PinsTab({ pinsState }: { pinsState: PinsState }) {
    const [filter, setFilter] = useState('');

    if (pinsState.phase === 'loading') {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            </div>
        );
    }
    if (pinsState.phase === 'error') {
        return <p className="text-center text-xs text-gray-400 py-6">No pinout data available</p>;
    }
    if (pinsState.phase !== 'ready') return null;

    const { pins, pkg } = pinsState;
    const q = filter.toLowerCase();
    const visible = filter
        ? pins.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.direction.includes(q) ||
            p.function.toLowerCase().includes(q)
          )
        : pins;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="Filter by name, direction, or function…"
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
                />
                {pkg && (
                    <span className="text-[11px] text-gray-400 border border-gray-200 px-2 py-1 rounded shrink-0">{pkg}</span>
                )}
            </div>
            <div className="space-y-1">
                {visible.map(pin => (
                    <div key={pin.number} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <span className="font-mono text-[11px] text-gray-400 w-8 shrink-0 pt-0.5">{pin.number}</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-xs font-semibold text-gray-900">{pin.name}</span>
                                <DirectionChip direction={pin.direction} />
                                {pin.logic_family && (
                                    <span className="text-[10px] text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded bg-white">
                                        {pin.logic_family.replace('_', '-')}
                                    </span>
                                )}
                                {pin.protocols.length > 0 && pin.protocols.map(proto => (
                                    <span key={proto} className="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-200 px-1 py-0.5 rounded">
                                        {proto}
                                    </span>
                                ))}
                            </div>
                            {pin.function && (
                                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{pin.function}</p>
                            )}
                            <div className="flex flex-wrap gap-2 mt-0.5">
                                {pin.voltage_domain && (
                                    <span className="text-[10px] text-blue-500">{pin.voltage_domain}</span>
                                )}
                                {pin.pull && (
                                    <span className="text-[10px] text-orange-500">{pin.pull}</span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {visible.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-4">No pins match filter</p>
            )}
        </div>
    );
}

function InterfacesTab({ model }: { model: PartModelData }) {
    return (
        <div className="space-y-3">
            {model.interfaces.length === 0 && (
                <p className="text-center text-xs text-gray-400 py-6">No interfaces extracted</p>
            )}
            {model.interfaces.map((iface, i) => (
                <div key={i} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                        <Activity className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        {/* instance is the name e.g. "I2C0", type is "I2C" */}
                        <span className="font-semibold text-sm text-gray-900">{iface.instance}</span>
                        <span className="text-xs text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded bg-white ml-1">{iface.type}</span>
                        {iface.role && (
                            <span className="text-[10px] text-purple-600 border border-purple-200 px-1.5 py-0.5 rounded bg-purple-50 ml-auto">{iface.role}</span>
                        )}
                    </div>
                    <div className="px-4 py-3 space-y-2 text-xs">
                        {iface.pins.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {iface.pins.map(p => (
                                    <span key={p} className="font-mono text-[11px] text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                                        {p}
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-500">
                            {iface.voltage_domain && (
                                <span><span className="font-medium">Rail:</span> {iface.voltage_domain}</span>
                            )}
                            {iface.max_speed && (
                                <span><span className="font-medium">Speed:</span> {iface.max_speed}</span>
                            )}
                            {iface.address && (
                                <span><span className="font-medium">Addr:</span> {iface.address}</span>
                            )}
                            {iface.channels != null && (
                                <span><span className="font-medium">Channels:</span> {iface.channels}</span>
                            )}
                        </div>
                        {iface.notes && (
                            <p className="text-gray-500 leading-relaxed">{iface.notes}</p>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function PowerTab({ model }: { model: PartModelData }) {
    const fmtV = (v: number | null) => v != null ? `${v}V` : '—';

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                {model.power.power_domains.map((domain, i) => (
                    <div key={i} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                        <div className="px-4 py-2.5 bg-yellow-50 border-b border-yellow-100 flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5 text-yellow-600 shrink-0" />
                            <span className="font-semibold text-sm text-gray-900">{domain.name}</span>
                        </div>
                        <div className="px-4 py-3 grid grid-cols-3 gap-3 text-xs">
                            <div>
                                <p className="text-gray-400 mb-0.5">Min</p>
                                <p className="font-medium text-gray-800">{fmtV(domain.voltage_min)}</p>
                            </div>
                            <div>
                                <p className="text-gray-400 mb-0.5">Typ</p>
                                <p className="font-medium text-gray-800">{fmtV(domain.voltage_typ)}</p>
                            </div>
                            <div>
                                <p className="text-gray-400 mb-0.5">Max</p>
                                <p className="font-medium text-gray-800">{fmtV(domain.voltage_max)}</p>
                            </div>
                            {domain.supply_pins.length > 0 && (
                                <div className="col-span-3">
                                    <p className="text-gray-400 mb-1">Supply pins</p>
                                    <div className="flex flex-wrap gap-1">
                                        {domain.supply_pins.map(p => (
                                            <span key={p} className="font-mono text-[11px] text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">{p}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {domain.required_decoupling.length > 0 && (
                                <div className="col-span-3">
                                    <p className="text-gray-400 mb-1">Decoupling</p>
                                    <ul className="space-y-0.5">
                                        {domain.required_decoupling.map((cap, j) => (
                                            <li key={j} className="text-gray-600 flex items-start gap-1">
                                                <span className="text-gray-300 shrink-0">·</span>{cap}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {domain.quiescent_current_typ && (
                                <div className="col-span-3">
                                    <p className="text-gray-400 mb-0.5">Quiescent current</p>
                                    <p className="text-gray-600">{domain.quiescent_current_typ}</p>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Profile-level current summary */}
            {(model.power.active_current_typ || model.power.sleep_current_typ) && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <p className="text-gray-400 mb-0.5">Active current</p>
                        <p className="font-medium text-gray-800">{model.power.active_current_typ ?? '—'}</p>
                    </div>
                    <div>
                        <p className="text-gray-400 mb-0.5">Sleep current</p>
                        <p className="font-medium text-gray-800">{model.power.sleep_current_typ ?? '—'}</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function SpecRow({ s }: { s: PartSpec }) {
    return (
        <div className="flex items-center justify-between px-4 py-2 text-xs">
            <div className="flex-1 min-w-0">
                <span className="text-gray-600">{s.name}</span>
                {s.conditions && <span className="text-gray-400 ml-2 text-[10px]">({s.conditions})</span>}
            </div>
            <span className="font-medium text-gray-900 shrink-0 ml-3">
                {s.value}{s.units ? ` ${s.units}` : ''}
            </span>
        </div>
    );
}

function ConstraintRow({ c }: { c: ConnectivityConstraint }) {
    return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs space-y-0.5">
            <div className="flex items-start gap-2">
                <span className="text-[10px] text-orange-600 border border-orange-200 bg-orange-50 px-1.5 py-0.5 rounded shrink-0 mt-0.5 font-mono">
                    {c.applies_to}
                </span>
                <span className="font-medium text-gray-800 leading-relaxed">{c.requirement}</span>
            </div>
            {c.reason && <p className="text-gray-400 text-[11px] pl-1">{c.reason}</p>}
            {c.schematic_note && <p className="text-blue-400 text-[11px] pl-1">{c.schematic_note}</p>}
        </div>
    );
}

function SpecsTab({ model }: { model: PartModelData }) {
    return (
        <div className="space-y-5">
            {model.key_specs.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Key Specs</h4>
                    <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                        {model.key_specs.map((s, i) => <SpecRow key={i} s={s} />)}
                    </div>
                </div>
            )}

            {model.absolute_max.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Absolute Maximum Ratings
                    </h4>
                    <div className="rounded-lg border border-red-100 bg-white divide-y divide-red-50">
                        {model.absolute_max.map((s, i) => <SpecRow key={i} s={s} />)}
                    </div>
                </div>
            )}

            {model.constraints.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Design Constraints</h4>
                    <div className="space-y-1.5">
                        {model.constraints.map((c, i) => <ConstraintRow key={i} c={c} />)}
                    </div>
                </div>
            )}

            {model.typical_application_notes.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Application Notes</h4>
                    <ul className="space-y-1.5">
                        {model.typical_application_notes.map((note, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                                <ChevronRight className="h-3 w-3 text-gray-400 shrink-0 mt-0.5" />
                                <span>{note}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {model.compatible_with.length > 0 && (
                <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Compatible With</h4>
                    <div className="space-y-1.5">
                        {model.compatible_with.map((dev, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                <span className="text-[10px] text-blue-600 border border-blue-200 bg-blue-50 px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                                    {dev.category}
                                </span>
                                <div>
                                    {dev.interface && <span className="font-medium text-gray-800">{dev.interface}</span>}
                                    {dev.note && <p className="text-gray-400 mt-0.5">{dev.note}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function OverviewTab({ model }: { model: PartModelData }) {
    return (
        <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <p className="text-gray-400 mb-1">Interfaces</p>
                    <p className="text-2xl font-bold text-gray-900">{model.interfaces.length}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <p className="text-gray-400 mb-1">Power Domains</p>
                    <p className="text-2xl font-bold text-gray-900">{model.power.power_domains.length}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <p className="text-gray-400 mb-1">Key Specs</p>
                    <p className="text-2xl font-bold text-gray-900">{model.key_specs.length}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                    <p className="text-gray-400 mb-1">Constraints</p>
                    <p className="text-2xl font-bold text-gray-900">{model.constraints.length}</p>
                </div>
            </div>

            {model.interfaces.length > 0 && (
                <div>
                    <p className="text-gray-500 font-medium mb-1.5">Interfaces</p>
                    <div className="flex flex-wrap gap-1.5">
                        {model.interfaces.map((iface, i) => (
                            <span key={i} className="text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-full">
                                {iface.type} · {iface.instance}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {model.power.power_domains.length > 0 && (
                <div>
                    <p className="text-gray-500 font-medium mb-1.5">Power Domains</p>
                    <div className="space-y-1">
                        {model.power.power_domains.map((d, i) => (
                            <div key={i} className="flex items-center justify-between rounded-lg bg-yellow-50 border border-yellow-100 px-3 py-1.5">
                                <span className="font-medium text-gray-800">{d.name}</span>
                                {d.voltage_typ != null && (
                                    <span className="text-yellow-700 font-mono">{d.voltage_typ}V</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {model.compatible_with.length > 0 && (
                <div>
                    <p className="text-gray-500 font-medium mb-1.5">Compatible With</p>
                    <div className="flex flex-wrap gap-1.5">
                        {model.compatible_with.map((d, i) => (
                            <span key={i} className="text-[11px] bg-gray-100 text-gray-600 border border-gray-200 px-2 py-1 rounded-full">
                                {d.category}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PartModelDrawer({ mpn, designId, isOpen, onClose, side = 'right' }: PartModelDrawerProps) {
    const [state, setState] = useState<DrawerState>({ phase: 'loading' });
    const [pinsState, setPinsState] = useState<PinsState>({ phase: 'idle' });
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const closedOffset = side === 'left' ? '-100%' : '100%';
    const sideClass = side === 'left' ? 'left-0' : 'right-0';

    // Fetch model when drawer opens
    useEffect(() => {
        if (!isOpen) return;
        // Reset drawer state immediately when a new part is selected so stale
        // model data is never shown while the request is in flight.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState({ phase: 'loading' });
        setPinsState({ phase: 'idle' });
        setActiveTab('overview');

        getPartModel(designId, mpn).then(res => {
            setState({ phase: 'ready', model: res.model, extractedAt: res.extracted_at });
        }).catch(err => {
            if (String(err.message ?? '').startsWith('404')) {
                setState({ phase: 'not_extracted' });
            } else {
                setState({ phase: 'error', message: String(err.message ?? err) });
            }
        });
    }, [isOpen, mpn, designId]);

    // Fetch pins lazily the first time the Pins tab is activated
    useEffect(() => {
        if (activeTab !== 'pins' || pinsState.phase !== 'idle' || state.phase !== 'ready') return;
        // The pins tab is lazy-loaded; flip to loading before the request so
        // the drawer does not show an empty tab during network work.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPinsState({ phase: 'loading' });
        getPartPinout(designId, mpn).then(res => {
            setPinsState({ phase: 'ready', pins: res.pins, pkg: res.package });
        }).catch(() => {
            setPinsState({ phase: 'error' });
        });
    }, [activeTab, pinsState.phase, state.phase, designId, mpn]);

    const handleExtract = async () => {
        setState({ phase: 'extracting' });
        try {
            const res = await triggerModelExtraction(designId, mpn);
            if (res.status === 'already_extracted' && res.model) {
                setState({ phase: 'ready', model: res.model, extractedAt: res.extracted_at! });
            }
            // extraction_started — background job running; user reopens drawer when done
        } catch (err: unknown) {
            setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 bg-black/20 z-40"
                        onClick={onClose}
                    />

                    <motion.div
                        key="panel"
                        initial={{ x: closedOffset }}
                        animate={{ x: 0 }}
                        exit={{ x: closedOffset }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className={`fixed ${sideClass} top-0 h-full w-[480px] max-w-full bg-white shadow-2xl z-50 flex flex-col`}
                    >
                        {/* Header */}
                        <div className="shrink-0 px-5 py-4 border-b border-gray-200 flex items-center gap-3">
                            <Database className="h-4 w-4 text-blue-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                                <h2 className="font-semibold text-gray-900 text-sm truncate">{mpn}</h2>
                                <p className="text-[11px] text-gray-400">Part Model</p>
                            </div>
                            {state.phase === 'ready' && (
                                <span className="text-[10px] text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full shrink-0">
                                    extracted
                                </span>
                            )}
                            <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-hidden flex flex-col">

                            {state.phase === 'loading' && (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="text-center">
                                        <Loader2 className="h-6 w-6 animate-spin text-blue-400 mx-auto mb-2" />
                                        <p className="text-sm text-gray-500">Loading model…</p>
                                    </div>
                                </div>
                            )}

                            {state.phase === 'not_extracted' && (
                                <div className="flex-1 flex items-center justify-center px-8">
                                    <div className="text-center">
                                        <Cpu className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                                        <h3 className="font-semibold text-gray-700 mb-1">No model extracted yet</h3>
                                        <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                                            Extract a structured electrical model from this part's datasheet using Claude.
                                        </p>
                                        <button
                                            onClick={handleExtract}
                                            className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
                                        >
                                            <Zap className="h-4 w-4" />
                                            Extract Model
                                        </button>
                                    </div>
                                </div>
                            )}

                            {state.phase === 'extracting' && (
                                <div className="flex-1 flex items-center justify-center px-8">
                                    <div className="text-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-blue-400 mx-auto mb-3" />
                                        <h3 className="font-semibold text-gray-700 mb-1">Extracting model…</h3>
                                        <p className="text-xs text-gray-400 leading-relaxed">
                                            Downloading datasheet, running Docling, and querying Claude.
                                            This takes 30–90 seconds — reopen this drawer when done.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {state.phase === 'error' && (
                                <div className="flex-1 flex items-center justify-center px-8">
                                    <div className="text-center">
                                        <AlertTriangle className="h-8 w-8 text-red-300 mx-auto mb-3" />
                                        <h3 className="font-semibold text-gray-700 mb-1">Failed to load model</h3>
                                        <p className="text-xs text-red-400 font-mono bg-red-50 border border-red-200 rounded px-3 py-2 mt-2 text-left leading-relaxed">
                                            {state.message}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {state.phase === 'ready' && (
                                <>
                                    {/* Tabs */}
                                    <div className="shrink-0 border-b border-gray-200 px-5 flex items-center">
                                        {TABS.map(tab => (
                                            <button
                                                key={tab.id}
                                                onClick={() => setActiveTab(tab.id)}
                                                className={`text-xs font-medium px-3 py-2.5 border-b-2 transition-colors ${
                                                    activeTab === tab.id
                                                        ? 'border-blue-500 text-blue-600'
                                                        : 'border-transparent text-gray-400 hover:text-gray-600'
                                                }`}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                        <span className="ml-auto text-[10px] text-gray-300 pr-1">
                                            {new Date(state.extractedAt).toLocaleDateString()}
                                        </span>
                                    </div>

                                    {/* Tab content */}
                                    <div className="flex-1 overflow-y-auto px-5 py-4">
                                        {activeTab === 'overview' && <OverviewTab model={state.model} />}
                                        {activeTab === 'pins' && <PinsTab pinsState={pinsState} />}
                                        {activeTab === 'interfaces' && <InterfacesTab model={state.model} />}
                                        {activeTab === 'power' && <PowerTab model={state.model} />}
                                        {activeTab === 'specs' && <SpecsTab model={state.model} />}
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
