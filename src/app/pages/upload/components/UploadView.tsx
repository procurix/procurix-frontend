import { useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, ArrowRight, Sparkles, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';
import {
  previewDesignBOM,
  uploadDesignBOM,
  fsmToStage,
  type BomColumnMapping,
  type BomPreviewResponse,
  type UploadResponse,
} from '@/app/services/api';
import { Button } from '@/app/shared/components/ui/button';

interface UploadViewProps {
  onUploadComplete: (data: UploadResponse & { fileName: string; sessionId: string }) => void;
  onProceedToClassification: () => void;
}

const SUPPORTED_BOM_EXTENSIONS = /\.(xlsx|xls|csv)$/i;

const MAPPING_FIELD_LABELS: Record<keyof BomColumnMapping, string> = {
  mpn: 'MPN',
  manufacturer: 'MFR',
  quantity: 'QTY',
  designator: 'REF',
};

const STRUCTURAL_COLUMN_LABELS: Array<{ label: string; aliases: string[] }> = [
  { label: 'VALUE', aliases: ['value', 'component value', 'part value', 'parttype', 'part type', 'rating'] },
  { label: 'DESC', aliases: ['description', 'desc', 'part description', 'comment'] },
  { label: 'PKG', aliases: ['footprint', 'package', 'case', 'pcb footprint'] },
  { label: 'DIST', aliases: ['distributor', 'dist', 'supplier', 'vendor'] },
  { label: 'SKU', aliases: ['distributor #', 'distributor#', 'distributor part', 'distributor pn', 'supplier part'] },
];

function normalizeColumnName(column: string): string {
  return column
    .trim()
    .toLowerCase()
    .replace(/[_\-/\\]+/g, ' ')
    .replace(/[^a-z0-9#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveColumns(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  rows.forEach(row => {
    Object.keys(row).forEach(column => seen.add(column));
  });
  return Array.from(seen);
}

function formatCell(value: unknown): string {
  if (value == null || value === '') return '-';
  return String(value);
}

function mappedFieldLabel(column: string, mapping: BomColumnMapping | null): string | null {
  if (!mapping) return null;
  const match = (Object.entries(mapping) as Array<[keyof BomColumnMapping, string | null]>)
    .find(([, mappedColumn]) => mappedColumn === column);
  if (match) return MAPPING_FIELD_LABELS[match[0]];
  const normalized = normalizeColumnName(column);
  return STRUCTURAL_COLUMN_LABELS.find(group => group.aliases.includes(normalized))?.label ?? null;
}

export function UploadView({ onUploadComplete, onProceedToClassification }: UploadViewProps) {
  const { setSessionId, setUploadData, setCurrentStage } = useSession();
  const { updateParams } = useQueryParams();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [preview, setPreview] = useState<BomPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<BomColumnMapping | null>(null);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const processFile = async (file: File) => {
    if (!SUPPORTED_BOM_EXTENSIONS.test(file.name)) {
      toast.error('Upload an Excel or CSV BOM file.');
      setUploadedFile(null);
      setUploadResult(null);
      setPreview(null);
      setMapping(null);
      return;
    }

    setUploadedFile(file);
    setIsProcessing(true);
    setUploadResult(null);
    setPreview(null);
    setMapping(null);
    try {
      const result = await previewDesignBOM(file);
      setPreview(result);
      setMapping(result.mapping);
      if (result.needs_review) {
        toast.info('Confirm the BOM column mapping before uploading.');
      } else {
        setIsProcessing(false);
        await commitUpload(file, null);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to upload BOM';
      toast.error(msg);
      setUploadedFile(null);
      setUploadResult(null);
      setPreview(null);
      setMapping(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateMapping = (key: keyof BomColumnMapping, value: string) => {
    setMapping(prev => ({
      mpn: prev?.mpn ?? null,
      manufacturer: prev?.manufacturer ?? null,
      quantity: prev?.quantity ?? null,
      designator: prev?.designator ?? null,
      [key]: value || null,
    }));
  };

  const commitUpload = async (
    fileOverride: File | null = uploadedFile,
    mappingOverride: BomColumnMapping | null = mapping,
  ) => {
    if (!fileOverride) return;
    if (mappingOverride && !mappingOverride.mpn) {
      toast.error('Select the MPN column before uploading.');
      return;
    }

    setIsCommitting(true);
    try {
      const result = await uploadDesignBOM(
        fileOverride.name.replace(/\.[^.]+$/, ''),
        fileOverride,
        undefined,
        mappingOverride ?? undefined,
      );
      const designId = result.design_id;
      setSessionId(designId);
      updateParams(designId);
      setUploadData(result);
      setUploadResult(result);
      setCurrentStage(fsmToStage(result.fsm_state));
      onUploadComplete({ fileName: fileOverride.name, sessionId: designId, ...result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to upload BOM';
      toast.error(msg);
    } finally {
      setIsCommitting(false);
    }
  };

  const renderMappingSelect = (label: string, key: keyof BomColumnMapping, required = false) => (
    <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
      {label}{required ? ' *' : ''}
      <select
        value={mapping?.[key] ?? ''}
        onChange={(e) => updateMapping(key, e.target.value)}
        className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
      >
        <option value="">Not present</option>
        {preview?.columns.map(column => (
          <option key={`${key}-${column}`} value={column}>{column}</option>
        ))}
      </select>
    </label>
  );

  const fullPreviewRows = preview?.rows_preview ?? [];
  const fullPreviewColumns = preview?.columns.length ? preview.columns : deriveColumns(fullPreviewRows);
  const uploadRows = uploadResult?.rows_preview?.length
    ? uploadResult.rows_preview
    : (preview?.rows_preview ?? []);
  const uploadColumns = uploadResult?.columns?.length
    ? uploadResult.columns
    : (preview?.columns.length ? preview.columns : deriveColumns(uploadRows));

  const renderBomTable = (
    columns: string[],
    rows: Record<string, unknown>[],
    options: { mapping?: BomColumnMapping | null; emptyText: string },
  ) => (
    <div className="max-h-96 overflow-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-max text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
          <tr>
            {columns.map(column => {
              const label = mappedFieldLabel(column, options.mapping ?? null);
              return (
                <th key={column} className="text-left px-3 py-2 whitespace-nowrap">
                  <span>{column}</span>
                  {label && (
                    <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                      {label}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length > 0 ? rows.map((row, rowIndex) => (
            <tr key={`bom-row-${rowIndex}`} className="bg-white">
              {columns.map(column => (
                <td
                  key={`${rowIndex}-${column}`}
                  className="max-w-72 truncate whitespace-nowrap px-3 py-2 text-gray-700"
                  title={formatCell(row[column])}
                >
                  {formatCell(row[column])}
                </td>
              ))}
            </tr>
          )) : (
            <tr>
              <td colSpan={Math.max(columns.length, 1)} className="px-3 py-6 text-center text-sm text-gray-500">
                {options.emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="w-full max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload BOM File</h1>
            <p className="text-gray-600">Upload your Bill of Materials file to begin analysis</p>
          </div>

          {uploadedFile && !isProcessing && preview?.needs_review && !uploadResult ? (
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="rounded-xl border border-blue-200 bg-white shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <Sparkles className="h-9 w-9 text-blue-500 shrink-0" />
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Confirm BOM Mapping</h2>
                    <p className="text-sm text-gray-500">{uploadedFile.name}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {Math.round(preview.mapping_confidence * 100)}% confidence
                    </p>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">
                      {preview.mapping_source === 'llm' ? 'AI proposal' : 'parser suggestion'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="px-8 py-5 space-y-5 border-b border-gray-100">
                {preview.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        {preview.warnings.map((warning, index) => (
                          <p key={`${warning}-${index}`}>{warning}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {renderMappingSelect('MPN column', 'mpn', true)}
                  {renderMappingSelect('Manufacturer', 'manufacturer')}
                  {renderMappingSelect('Quantity', 'quantity')}
                  {renderMappingSelect('Designator', 'designator')}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Full BOM Preview</h3>
                    <span className="text-xs text-gray-500">{fullPreviewRows.length} rows</span>
                  </div>
                  {renderBomTable(fullPreviewColumns, fullPreviewRows, {
                    mapping,
                    emptyText: 'No rows found in this BOM.',
                  })}
                </div>
              </div>

              <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setUploadedFile(null);
                    setPreview(null);
                    setMapping(null);
                  }}
                  disabled={isCommitting}
                >
                  Choose Different File
                </Button>
                <Button
                  onClick={() => commitUpload()}
                  disabled={isCommitting || !mapping?.mpn}
                  size="lg"
                  className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                >
                  <span>{isCommitting ? 'Uploading...' : 'Confirm Mapping & Upload'}</span>
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </div>
            </motion.div>
          ) : uploadedFile && !isProcessing && uploadResult ? (
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="rounded-xl border-2 border-green-200 bg-white shadow-sm overflow-hidden">
              {/* Header */}
              <div className="px-8 py-6 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <CheckCircle className="h-10 w-10 text-green-500 shrink-0" />
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Upload Successful</h2>
                    <p className="text-sm text-gray-500">{uploadedFile.name}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-3xl font-bold text-gray-900">{uploadResult.part_count}</p>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">distinct parts</p>
                  </div>
                </div>
              </div>

              {uploadRows.length > 0 && (
                <div className="px-8 py-5 border-b border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Full BOM Preview</h3>
                    {uploadResult.total_quantity != null && (
                      <span className="text-xs text-gray-500">
                        {uploadRows.length} rows / {uploadResult.total_quantity} total instances
                      </span>
                    )}
                  </div>
                  {renderBomTable(uploadColumns, uploadRows, {
                    mapping,
                    emptyText: 'No rows found in this BOM.',
                  })}
                </div>
              )}

              {/* Footer */}
              <div className="px-8 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                <Button
                  onClick={onProceedToClassification}
                  size="lg"
                  className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                >
                  <span>Start Part Identification</span>
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </div>
            </motion.div>
          ) : (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`rounded-xl border-2 border-dashed p-12 text-center transition-all ${
                isDragging ? 'border-blue-500 bg-blue-50'
                : isProcessing || isCommitting ? 'border-gray-300 bg-gray-50'
                : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/50'
              }`}
            >
              {isProcessing || isCommitting ? (
                <div className="space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto" />
                  <p className="text-gray-600">{isCommitting ? 'Uploading BOM...' : 'Processing file...'}</p>
                </div>
              ) : (
                <>
                  <Upload className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Drag and drop your BOM file here</h3>
                  <p className="text-gray-600 mb-6">Supports Excel (.xlsx, .xls) and CSV files</p>
                  <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
                    <FileSpreadsheet className="h-5 w-5" />
                    <span>Choose File</span>
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" />
                  </label>
                </>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
