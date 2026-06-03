import { useEffect, useMemo, useState } from 'react';
import { Check, Lightbulb, Loader2, Send, Sparkles, X } from 'lucide-react';
import { Button } from '@/app/shared/components/ui/button';
import { Input } from '@/app/shared/components/ui/input';
import { useAgent } from '@/app/shared/useAgent';
import { getArchitectureProposals, type ArchitectureNet } from '@/app/services/api';
import {
  canApplyProposal,
  canDismissProposal,
  getProposalAction,
  getProposalConfig,
  renderProposalDetails,
  type ArchitectureAssistantProposal,
} from '../utils/architectureProposalRegistry';


interface ArchitectureAssistantPanelProps {
  designId?: string;
  selectedNetId?: string | null;
  selectedConnectionId?: string | null;
  reviewRequiredCount: number;
  nets?: ArchitectureNet[];
  onApplyProposal?: (proposal: ArchitectureAssistantProposal) => Promise<string | void>;
  onDismissProposal?: (proposal: ArchitectureAssistantProposal) => Promise<string | void>;
}

type ChatEntry = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  proposals?: ArchitectureAssistantProposal[];
};

type ApplyStatus = 'idle' | 'applying' | 'applied' | 'dismissing' | 'dismissed' | 'error';
type SendOptions = { mode?: string };

function proposalList(data: unknown): ArchitectureAssistantProposal[] {
  if (!data || typeof data !== 'object') return [];
  const proposals = (data as { proposals?: unknown }).proposals;
  return Array.isArray(proposals) ? proposals as ArchitectureAssistantProposal[] : [];
}

export function ArchitectureAssistantPanel({
  designId,
  selectedNetId,
  selectedConnectionId,
  reviewRequiredCount,
  nets = [],
  onApplyProposal,
  onDismissProposal,
}: ArchitectureAssistantPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [applyStatus, setApplyStatus] = useState<Record<string, ApplyStatus>>({});
  const [applyNotes, setApplyNotes] = useState<Record<string, string>>({});
  const agent = useAgent(designId || '', 'architecture');

  const focusText = useMemo(() => {
    const focus: string[] = [];
    if (selectedNetId) focus.push(`Selected net node: ${selectedNetId}`);
    if (selectedConnectionId) focus.push(`Selected connection edge: ${selectedConnectionId}`);
    if (reviewRequiredCount > 0) focus.push(`${reviewRequiredCount} suggested nets still need review.`);
    return focus.join('\n');
  }, [reviewRequiredCount, selectedConnectionId, selectedNetId]);

  useEffect(() => {
    if (!open || !designId) return;
    let cancelled = false;
    void getArchitectureProposals(designId, 'pending')
      .then((response) => {
        if (cancelled) return;
        const pendingRiskNotes = (response.proposals || []).filter((proposal) => (
          getProposalAction(proposal) === 'flag_issue'
        )) as ArchitectureAssistantProposal[];
        if (pendingRiskNotes.length === 0) return;
        setEntries((prev) => {
          const existingIds = new Set(prev.flatMap((entry) => (
            entry.proposals?.map((proposal) => proposal.id).filter(Boolean) || []
          )));
          const unseenNotes = pendingRiskNotes.filter((proposal) => (
            proposal.id && !existingIds.has(proposal.id)
          ));
          if (unseenNotes.length === 0) return prev;
          return [
            ...prev,
            {
              id: `risk-${Date.now()}`,
              role: 'assistant',
              content: 'Open architecture risk notes.',
              proposals: unseenNotes,
            },
          ];
        });
      })
      .catch((error) => {
        console.warn('Could not load architecture risk notes.', error);
      });
    return () => {
      cancelled = true;
    };
  }, [designId, open]);

  const send = async (message: string, options: SendOptions = {}) => {
    const text = message.trim();
    if (!text || !designId || agent.loading) return;
    setDraft('');
    setEntries((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: text }]);
    try {
      const response = await agent.send(`${focusText ? `${focusText}\n\n` : ''}User request: ${text}`, options);
      setEntries((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: response.message,
          proposals: proposalList(response.data),
        },
      ]);
    } catch (error) {
      setEntries((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: error instanceof Error ? error.message : 'Architecture assistant failed.',
        },
      ]);
    }
  };

  const applyProposal = async (proposal: ArchitectureAssistantProposal, key: string) => {
    if (!onApplyProposal || !canApplyProposal(proposal)) return;
    setApplyStatus((prev) => ({ ...prev, [key]: 'applying' }));
    setApplyNotes((prev) => ({ ...prev, [key]: '' }));
    try {
      const note = await onApplyProposal(proposal);
      setApplyStatus((prev) => ({ ...prev, [key]: 'applied' }));
      setApplyNotes((prev) => ({ ...prev, [key]: note || 'Applied.' }));
    } catch (error) {
      setApplyStatus((prev) => ({ ...prev, [key]: 'error' }));
      setApplyNotes((prev) => ({
        ...prev,
        [key]: error instanceof Error ? error.message : 'Could not apply proposal.',
      }));
    }
  };

  const dismissProposal = async (proposal: ArchitectureAssistantProposal, key: string) => {
    if (!onDismissProposal || !canDismissProposal(proposal)) return;
    setApplyStatus((prev) => ({ ...prev, [key]: 'dismissing' }));
    setApplyNotes((prev) => ({ ...prev, [key]: '' }));
    try {
      const note = await onDismissProposal(proposal);
      setApplyStatus((prev) => ({ ...prev, [key]: 'dismissed' }));
      setApplyNotes((prev) => ({ ...prev, [key]: note || 'Dismissed.' }));
    } catch (error) {
      setApplyStatus((prev) => ({ ...prev, [key]: 'error' }));
      setApplyNotes((prev) => ({
        ...prev,
        [key]: error instanceof Error ? error.message : 'Could not dismiss proposal.',
      }));
    }
  };

  if (!designId) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg transition hover:bg-slate-50"
        title="Open architecture assistant"
      >
        <Sparkles className="h-4 w-4 text-indigo-600" />
        Assistant
      </button>
    );
  }

  return (
    <div className="w-[360px] rounded-lg border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          Architecture assistant
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          Close
        </button>
      </div>

      <div className="max-h-72 space-y-3 overflow-y-auto px-3 py-3">
        {entries.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            Ask for explanation, suspicious net grouping checks, pin mapping review, or split/merge suggestions. Proposed changes stay review-only until you apply them.
          </div>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className={entry.role === 'user' ? 'text-right' : 'text-left'}>
            <div className={`inline-block max-w-full rounded-lg px-3 py-2 text-xs leading-5 ${
              entry.role === 'user'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-50 text-slate-700'
            }`}>
              {entry.content}
            </div>
            {entry.proposals && entry.proposals.length > 0 && (
              <div className="mt-2 space-y-2 text-left">
                {entry.proposals.map((proposal, index) => {
                  const key = `${entry.id}:${index}`;
                  const status = applyStatus[key] || 'idle';
                  const isApplying = status === 'applying';
                  const isApplied = status === 'applied';
                  const isDismissing = status === 'dismissing';
                  const isDismissed = status === 'dismissed';
                  const config = getProposalConfig(proposal);
                  const applyable = canApplyProposal(proposal) && Boolean(onApplyProposal);
                  const dismissable = canDismissProposal(proposal) && Boolean(onDismissProposal);
                  const isBusy = isApplying || isDismissing || isApplied || isDismissed;
                  const action = getProposalAction(proposal);
                  const details = renderProposalDetails(proposal, nets);
                  return (
                    <div key={key} className="rounded-md border border-indigo-100 bg-indigo-50 p-2 text-xs text-indigo-950">
                      <div className="flex items-center gap-2 font-bold">
                        <Lightbulb className="h-3.5 w-3.5" />
                        <span className="min-w-0 flex-1 truncate">{proposal.title || action || 'Proposal'}</span>
                      </div>
                      {proposal.reasoning && (
                        <div className="mt-1 leading-5 text-indigo-800">{proposal.reasoning}</div>
                      )}
                      {details && (
                        <div className="mt-2 rounded bg-white/70 px-2 py-1 font-medium text-indigo-700">{details}</div>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="font-mono text-[10px] text-indigo-500">
                          {action}
                          {proposal.confidence != null ? ` - ${Math.round(Number(proposal.confidence) * 100)}%` : ''}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {config.applyable && (
                            <Button
                              type="button"
                              size="sm"
                              variant={isApplied ? 'outline' : 'default'}
                              className="h-7 px-2 text-[11px]"
                              disabled={!applyable || isBusy}
                              onClick={() => void applyProposal(proposal, key)}
                            >
                              {isApplying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                              {isApplied ? <Check className="mr-1 h-3 w-3" /> : null}
                              {isApplied ? 'Applied' : config.label}
                            </Button>
                          )}
                          {config.dismissable && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              disabled={!dismissable || isBusy}
                              onClick={() => void dismissProposal(proposal, key)}
                            >
                              {isDismissing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                              {isDismissed ? <X className="mr-1 h-3 w-3" /> : null}
                              {isDismissed ? 'Dismissed' : 'Dismiss'}
                            </Button>
                          )}
                        </div>
                      </div>
                      {applyNotes[key] && (
                        <div className={`mt-2 rounded px-2 py-1 text-[11px] ${
                          status === 'error'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-white/70 text-indigo-700'
                        }`}>
                          {applyNotes[key]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-slate-100 p-3">
        <div className="mb-2 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => void send('Find suspicious net groupings and pin mappings.', { mode: 'risk_review' })}
            className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
          >
            Check risks
          </button>
          <button
            type="button"
            onClick={() => void send('Suggest useful net split, merge, or rename cleanup patches.')}
            className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
          >
            Suggest cleanup
          </button>
          <button
            type="button"
            onClick={() => void send('Suggest source and target pins for unresolved connection candidates. Use only supplied pin lists and return flag_issue if uncertain.')}
            className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
          >
            Suggest pins
          </button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about this architecture..."
            className="h-9 text-xs"
          />
          <Button type="submit" size="sm" disabled={!draft.trim() || agent.loading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
