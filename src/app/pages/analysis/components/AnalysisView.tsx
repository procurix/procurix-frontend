import { useState, useEffect, useRef, useCallback } from 'react';
import { CheckCircle, Zap, Loader2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useSession } from '@/app/context/SessionContext';
import { analyzeSystem, getCurrentStage, getSystemAnalysis, selectSystemType, type SystemSuggestion } from '@/app/services/api';
import { usePipelineStage } from '@/app/shared/usePipelineStage';
import { useAgent } from '@/app/shared/useAgent';

interface Line {
  id: string;
  type: 'input' | 'output' | 'system' | 'error';
  content: string;
}

interface AnalysisViewProps {
  onSystemTypeSelected: (systemType: string) => void;
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high:   'bg-green-50 border-green-200 text-green-700',
  medium: 'bg-blue-50  border-blue-200  text-blue-700',
  low:    'bg-gray-50  border-gray-200  text-gray-600',
};

export function AnalysisView({ onSystemTypeSelected }: AnalysisViewProps) {
  const { sessionId, currentStage, triggerRefresh } = useSession();

  const [lines, setLines]             = useState<Line[]>([]);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [suggestions, setSuggestions] = useState<SystemSuggestion[]>([]);
  const [selected, setSelected]       = useState<number | null>(null);
  const [confirming, setConfirming]   = useState(false);

  const initiatedRef = useRef(false);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const { run: runStage } = usePipelineStage({ pollIntervalMs: 3000, maxAttempts: 60 });

  const handleToolResult = useCallback((tool: string, data: unknown) => {
    if (tool === 'generate_suggestions') {
      const result = data as { mode: string; suggestions: SystemSuggestion[] };
      if (result?.suggestions) {
        setSuggestions(result.suggestions);
        setSelected(null);
        triggerRefresh();
      }
    } else if (tool === 'confirm_system_type') {
      const result = data as { system_type: string };
      toast.success(`System type confirmed: ${result.system_type}`);
      onSystemTypeSelected(result.system_type);
    }
  }, [triggerRefresh, onSystemTypeSelected]);

  const agent = useAgent(sessionId ?? '', 'analyze', { onToolResult: handleToolResult });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, loading]);

  useEffect(() => {
    if (!sessionId || initiatedRef.current) return;
    initiatedRef.current = true;

    const init = async () => {
      // Avoid rerunning analysis when a refreshed design has already advanced.
      // Stage 1 = bom_uploaded — skip the GET, go straight to trigger.
      // Wrap in try-catch: a 404 means analysis hasn't run yet — fall through to sendTrigger.
      const resolvedStage = currentStage ?? await getCurrentStage(sessionId)
        .then(stage => stage.current_stage)
        .catch(() => null);

      // system_analyzed means suggestions exist but the human review is still
      // pending. Hydrate those suggestions instead of rerunning analysis.
      try {
        const existing = await getSystemAnalysis(sessionId);
        if (existing.suggestions?.length) {
          setSuggestions(existing.suggestions);
          const top = existing.suggestions[0];
          pushSystem(
            existing.confirmed
              ? `System type already confirmed: ${existing.system_type ?? top?.systemType ?? 'selected option'}. Continue to Classification.`
              : top?.confidence === 'high'
                ? `${top.systemType} - select from the options on the right or type to refine.`
                : `${existing.suggestions.length} options identified - review on the right or type to refine.`
          );
          return;
        }
      } catch {
        // Analysis is not available yet; fall through to the first trigger.
      }

      if (resolvedStage !== null && resolvedStage >= 4) {
        try {
          const existing = await getSystemAnalysis(sessionId);
          if (existing.success && existing.suggestions?.length) {
            setSuggestions(existing.suggestions);
            const top = existing.suggestions[0];
            pushSystem(
              top?.confidence === 'high'
                ? `${top.systemType} — select from the options on the right or type to refine.`
                : `${existing.suggestions.length} options identified — review on the right or type to refine.`
            );
            return;
          }
        } catch {
          // 404 or network error — analysis not yet available, fall through to trigger
        }
        pushSystem('System identification is already complete. Continue to Classification.');
        return;
      }

      await sendTrigger();
    };

    init();
  // The analysis trigger is intentionally one-shot per mounted session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const pushLine = (type: Line['type'], content: string) => {
    setLines(prev => [...prev, { id: `${Date.now()}_${Math.random()}_${type}`, type, content }]);
  };
  const pushSystem = (content: string) => pushLine('system', content);
  const pushOutput = (content: string) => pushLine('output', content);
  const pushError  = (content: string) => pushLine('error', content);

  const sendTrigger = async (additionalContext?: string) => {
    if (!sessionId) return;
    setLoading(true);
    pushSystem('Analyzing system type...');

    const onReady = (res: { suggestions?: SystemSuggestion[] }) => {
      if (res.suggestions?.length) {
        setSuggestions(res.suggestions);
        const top = res.suggestions[0];
        pushOutput(
          top?.confidence === 'high'
            ? `${top.systemType} — select from the options on the right or type to refine.`
            : `${res.suggestions.length} options identified — review on the right or type to refine.`
        );
        triggerRefresh();
      }
      setLoading(false);
      inputRef.current?.focus();
    };

    await runStage(
      () => analyzeSystem(sessionId, additionalContext),
      () => getSystemAnalysis(sessionId),
      (res) => {
        if (res.error) throw new Error(res.error);
        return !!(res.suggestions?.length);
      },
      onReady,
      (err) => {
        pushError(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setLoading(false);
        inputRef.current?.focus();
      },
    );
  };


  const send = async () => {
    const text = input.trim();
    if (!text || agent.loading || !sessionId) return;

    pushLine('input', text);
    setInput('');

    try {
      const res = await agent.send(text);
      pushOutput(res.message);
    } catch (err: unknown) {
      pushError(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      inputRef.current?.focus();
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  };

  const handleConfirm = async () => {
    if (selected === null || !sessionId) return;
    setConfirming(true);
    try {
      await selectSystemType(sessionId, selected);
      const s = suggestions[selected];
      toast.success(`System type confirmed: ${s.systemType}`);
      onSystemTypeSelected(s.systemType);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="h-full flex overflow-hidden bg-gray-50">

      {/* ── Left: console ───────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-gray-200 bg-white">

        {/* Header */}
        <div className="shrink-0 px-6 py-3 border-b border-gray-100 bg-white">
          <h2 className="font-semibold text-gray-900 text-sm">System Identification</h2>
          <p className="text-xs text-gray-400 font-mono mt-0.5">session · {sessionId?.slice(0, 8) ?? '—'}</p>
        </div>

        {/* Output stream */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-2 font-mono text-sm">
          {lines.length === 0 && !loading && (
            <span className="text-gray-300 text-xs">initializing…</span>
          )}

          <AnimatePresence initial={false}>
            {lines.map(line => (
              <motion.div
                key={line.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.1 }}
                className="leading-relaxed"
              >
                {line.type === 'input' && (
                  <div className="flex gap-2">
                    <span className="text-blue-500 select-none shrink-0">❯</span>
                    <span className="text-gray-800">{line.content}</span>
                  </div>
                )}
                {line.type === 'output' && (
                  <div className="text-gray-600 whitespace-pre-wrap pl-5">
                    {line.content}
                  </div>
                )}
                {line.type === 'system' && (
                  <div className="text-blue-600 pl-5">{line.content}</div>
                )}
                {line.type === 'error' && (
                  <div className="text-red-500 pl-5">{line.content}</div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {(loading || agent.loading) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="pl-5 flex items-center gap-2 text-gray-400"
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs">processing…</span>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input row */}
        <div className="shrink-0 border-t border-gray-100 bg-white px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="text-blue-500 font-mono text-sm select-none">❯</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type a response or ask for different options…"
              disabled={loading || agent.loading}
              className="flex-1 bg-transparent font-mono text-sm text-gray-800 placeholder-gray-300 outline-none caret-blue-500 disabled:opacity-40"
            />
            {(loading || agent.loading) && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-300 shrink-0" />}
          </div>
          <p className="text-xs text-gray-300 font-mono mt-1.5 pl-5">enter to send</p>
        </div>
      </div>

      {/* ── Right: results panel ─────────────────────────────────── */}
      <div className="w-[420px] shrink-0 flex flex-col overflow-hidden bg-gray-50">

        {/* Panel header */}
        <div className="shrink-0 px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-sm">
            {suggestions.length > 0
              ? `${suggestions.length} System Type Options`
              : 'Waiting for identification…'}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {suggestions.length > 0
              ? 'Select the best match and confirm to proceed'
              : 'Options will appear here as the conversation progresses'}
          </p>
        </div>

        {/* Cards */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {suggestions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12 text-gray-400 space-y-3">
              <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center">
                <Info className="h-6 w-6 text-gray-300" />
              </div>
              <p className="text-sm">Answer the questions on the left.<br />Options will appear here automatically.</p>
            </div>
          )}

          <AnimatePresence>
            {suggestions.map((s, i) => {
              const isSelected = selected === i;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  onClick={() => setSelected(isSelected ? null : i)}
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>{i + 1}</span>
                      <h4 className="font-semibold text-gray-900 text-sm leading-tight">{s.systemType}</h4>
                    </div>
                    {isSelected && <CheckCircle className="h-4 w-4 text-blue-500 shrink-0" />}
                  </div>

                  <p className="text-xs text-gray-600 mb-2 pl-8">{s.primaryFunction}</p>

                  <span className={`inline-block ml-8 px-2 py-0.5 rounded-full text-xs font-medium border ${CONFIDENCE_STYLES[s.confidence] ?? CONFIDENCE_STYLES.low}`}>
                    {s.confidence.charAt(0).toUpperCase() + s.confidence.slice(1)} confidence
                  </span>

                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-blue-200 pl-8 space-y-2">
                      {s.keyArchitecturalClues?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                            <Zap className="h-3 w-3 text-blue-500" /> Key clues
                          </p>
                          <ul className="space-y-0.5">
                            {s.keyArchitecturalClues.slice(0, 4).map((c, ci) => (
                              <li key={ci} className="text-xs text-gray-600 flex gap-1.5">
                                <span className="text-blue-400 mt-0.5">·</span>{c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="text-xs text-gray-600 italic">{s.reasoning}</p>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Confirm button */}
        {selected !== null && (
          <div className="shrink-0 px-4 py-4 border-t border-gray-200 bg-white">
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="w-full rounded-xl bg-blue-600 py-3 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {confirming
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirming…</>
                : <><CheckCircle className="h-4 w-4" /> Confirm {suggestions[selected]?.systemType}</>
              }
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
