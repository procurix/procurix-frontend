import { CircleDot, ExternalLink, FileSearch, Loader2, Target, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { PartSpecEvidence } from '@/app/services/api';
import { formatTraceValue } from '../utils';
import { SectionTitle } from './RequirementPrimitives';

export function TraceabilityDrawer({
  mpn,
  evidence,
  loading,
  onClose,
}: {
  mpn: string;
  evidence?: PartSpecEvidence;
  loading: boolean;
  onClose: () => void;
}) {
  const model = evidence?.model ?? null;
  const interfaces = Array.isArray(model?.interfaces) ? model.interfaces.slice(0, 6) : [];
  const constraints = Array.isArray(model?.constraints) ? model.constraints.slice(0, 8) : [];
  const keySpecs = Array.isArray(model?.key_specs) ? model.key_specs.slice(0, 8) : [];
  const power = model?.power && typeof model.power === 'object' ? model.power : null;
  const params = evidence?.params ? Object.entries(evidence.params).slice(0, 10) : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <motion.aside
        initial={{ x: 420 }}
        animate={{ x: 0 }}
        className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Traceability Evidence</div>
              <h3 className="mt-1 font-mono text-lg font-semibold text-gray-950">{mpn}</h3>
              {evidence?.manufacturer && <p className="text-sm text-gray-500">{evidence.manufacturer}</p>}
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-gray-500 hover:bg-gray-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {loading ? (
            <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading evidence...
            </div>
          ) : !evidence ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              No catalog or model evidence was found for this source.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-gray-200 p-4">
                <SectionTitle icon={<FileSearch className="h-4 w-4" />} title="Catalog" />
                <dl className="mt-3 grid gap-2 text-sm">
                  <TraceRow label="Category" value={evidence.Category} />
                  <TraceRow label="Function" value={evidence.part_function} />
                  <TraceRow label="Topology" value={evidence.topology_family} />
                  <TraceRow label="Description" value={evidence.Description} />
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  {evidence.datasheet_url && (
                    <a href={evidence.datasheet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Datasheet
                    </a>
                  )}
                  {evidence.product_url && (
                    <a href={evidence.product_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Product
                    </a>
                  )}
                </div>
              </div>

              <TraceSection title="Interfaces" items={interfaces} empty="No interfaces extracted." />
              <TraceSection title="Constraints" items={constraints} empty="No constraints extracted." />
              <TraceSection title="Key Specs" items={keySpecs} empty="No key specs extracted." />

              {power && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <SectionTitle icon={<Target className="h-4 w-4" />} title="Power Model" />
                  <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-700">
                    {JSON.stringify(power, null, 2)}
                  </pre>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 p-4">
                <SectionTitle icon={<CircleDot className="h-4 w-4" />} title="Catalog Parameters" />
                {params.length ? (
                  <div className="mt-3 grid gap-2">
                    {params.map(([key, value]) => <TraceRow key={key} label={key} value={formatTraceValue(value)} />)}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">No catalog parameters available.</p>
                )}
              </div>
            </>
          )}
        </div>
      </motion.aside>
    </div>
  );
}

function TraceRow({ label, value }: { label: string; value?: unknown }) {
  if (value == null || value === '') return null;
  return (
    <div className="grid gap-1 rounded-md bg-gray-50 p-2">
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-800">{formatTraceValue(value)}</dd>
    </div>
  );
}

function TraceSection({ title, items, empty }: { title: string; items: unknown[]; empty: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <SectionTitle icon={<FileSearch className="h-4 w-4" />} title={title} />
      {items.length ? (
        <div className="mt-3 space-y-2">
          {items.map((item, index) => (
            <pre key={index} className="overflow-auto rounded-md bg-gray-50 p-3 text-xs text-gray-700">
              {formatTraceValue(item)}
            </pre>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500">{empty}</p>
      )}
    </div>
  );
}
