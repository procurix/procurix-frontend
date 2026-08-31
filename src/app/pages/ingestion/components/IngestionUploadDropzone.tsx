import { useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/app/shared/components/ui/utils';
import { Button } from '@/app/shared/components/ui/button';
import { uploadIngestionDocuments } from '@/app/services/api/ingestion';

const SUPPORTED_EXTENSIONS = /\.(xlsx|xls)$/i;

interface IngestionUploadDropzoneProps {
  parsingAvailable: boolean;
  disabled?: boolean;
  onUploaded: (documentIds: string[]) => void;
}

export function IngestionUploadDropzone({
  parsingAvailable,
  disabled,
  onUploaded,
}: IngestionUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const uploadFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (!selected.length) return;

    const invalid = selected.filter((file) => !SUPPORTED_EXTENSIONS.test(file.name));
    if (invalid.length) {
      toast.error('Upload Excel spreadsheets only (.xlsx or .xls).');
      return;
    }

    if (!parsingAvailable) {
      toast.error('Parsing is unavailable on the backend. Set LLAMA_CLOUD_API_KEY and restart.');
      return;
    }

    setIsUploading(true);
    try {
      const results = await uploadIngestionDocuments(selected, { parse: true });
      const count = results.length;
      toast.success(
        count === 1
          ? `Uploaded ${results[0].document.filename}`
          : `Uploaded ${count} documents`,
        {
          description: 'Parsing in the background — tables will appear when ready.',
        },
      );
      onUploaded(results.map((result) => result.document.id));
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled || isUploading || !parsingAvailable) return;
    void uploadFiles(event.dataTransfer.files);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !isUploading && parsingAvailable) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-slate-300 bg-slate-50 hover:border-slate-400',
          (disabled || isUploading || !parsingAvailable) && 'pointer-events-none opacity-60',
        )}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
          {isUploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
        </div>
        <p className="mt-4 text-sm font-medium text-slate-800">
          {isUploading ? 'Uploading…' : 'Drop spreadsheets here'}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Excel (.xlsx, .xls) — multiple files supported
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) void uploadFiles(event.target.files);
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          disabled={disabled || isUploading || !parsingAvailable}
          onClick={() => inputRef.current?.click()}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Choose files
        </Button>
        {!parsingAvailable && (
          <p className="mt-3 text-xs text-amber-700">
            Upload disabled — parsing requires LlamaCloud (<code className="font-mono">LLAMA_CLOUD_API_KEY</code>).
          </p>
        )}
      </div>
    </div>
  );
}
