import { useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { useIngestionHealth } from '@/app/pages/ingestion/hooks/useIngestionHealth';
import { useIngestionDocuments } from '@/app/pages/ingestion/hooks/useIngestionDocuments';
import { IngestionUploadDropzone } from '@/app/pages/ingestion/components/IngestionUploadDropzone';
import { IngestionDocumentList } from '@/app/pages/ingestion/components/IngestionDocumentList';

export function IngestionDocumentsPage() {
  const navigate = useNavigate();
  const { capabilities, isLoading: healthLoading, error: healthError } = useIngestionHealth();
  const {
    entries,
    isLoading,
    error,
    isPolling,
    refresh,
  } = useIngestionDocuments();

  const parsingReady = capabilities?.parsing ?? false;
  const backendReady = !healthError && (capabilities?.database ?? false);

  const handleUploaded = async (documentIds: string[]) => {
    await refresh();
    if (documentIds.length === 1) {
      navigate(`/ingestion/documents/${documentIds[0]}`);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-blue-50 p-3 text-blue-600">
            <Upload className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-900">Upload documents</h2>
            <p className="mt-1 text-sm text-slate-600">
              Spreadsheets are parsed into editable table chunks via LlamaSheets.
              After parsing finishes, open a document to review tables and continue
              the pipeline.
            </p>
            {!healthLoading && !parsingReady && !healthError && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Parsing is unavailable — set <code className="font-mono">LLAMA_CLOUD_API_KEY</code>{' '}
                in the ingestion backend and restart before uploading.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6">
          <IngestionUploadDropzone
            parsingAvailable={parsingReady}
            disabled={!backendReady || healthLoading}
            onUploaded={handleUploaded}
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Your documents</h2>
        <IngestionDocumentList
          entries={entries}
          isLoading={isLoading}
          error={error ?? (healthError ? 'Connect the ingestion backend to list documents.' : null)}
          isPolling={isPolling}
          onRefresh={refresh}
        />
      </div>
    </section>
  );
}
