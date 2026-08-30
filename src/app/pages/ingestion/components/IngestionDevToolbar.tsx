import { useIngestionDev } from '@/app/pages/ingestion/state/IngestionDevContext';
import { Button } from '@/app/shared/components/ui/button';
import { cn } from '@/app/shared/components/ui/utils';

export function IngestionDevToolbar() {
  const dev = useIngestionDev();
  const active = dev.designMode || dev.mockMode || dev.captureFixtures;

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 text-sm',
        active ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">Developer controls</p>
          <p className="text-xs text-slate-600">
            Iterate on UI without burning tokens — design mode skips agents; mock mode replays fact + NER fixtures.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ToggleButton
            active={dev.designMode}
            onClick={() => dev.setDesignMode(!dev.designMode)}
            label="Design mode"
          />
          <ToggleButton
            active={dev.mockMode}
            onClick={() => dev.setMockMode(!dev.mockMode)}
            label="Mock agents"
          />
          <ToggleButton
            active={dev.captureFixtures}
            onClick={() => dev.setCaptureFixtures(!dev.captureFixtures)}
            label="Capture next run"
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={dev.applyCapturedToMock}>
          Use captured fixtures
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={dev.downloadFixtures}>
          Download fixtures
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={dev.clearFixtures}>
          Clear captured
        </Button>
        {(dev.capturedFixtures || dev.capturedNerFixtures) && (
          <span className="self-center text-xs text-slate-500">
            {dev.capturedFixtures && (
              <>Facts: {new Date(dev.capturedFixtures.capturedAt).toLocaleString()}</>
            )}
            {dev.capturedFixtures && dev.capturedNerFixtures && ' · '}
            {dev.capturedNerFixtures && (
              <>NER: {new Date(dev.capturedNerFixtures.capturedAt).toLocaleString()}</>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-amber-400 bg-amber-100 text-amber-900'
          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400',
      )}
    >
      {label}: {active ? 'on' : 'off'}
    </button>
  );
}
