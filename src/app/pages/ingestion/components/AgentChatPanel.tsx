import type { FactSessionMessage } from '@/app/services/api/ingestion';
import { Button } from '@/app/shared/components/ui/button';
import { Textarea } from '@/app/shared/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

interface AgentChatPanelProps {
  messages: FactSessionMessage[];
  placeholder?: string;
  isSending?: boolean;
  onSend: (message: string) => Promise<void>;
}

export function AgentChatPanel({
  messages,
  placeholder = 'e.g. merge facts 1 and 2, add a fact about lead time…',
  isSending,
  onSend,
}: AgentChatPanelProps) {
  const [draft, setDraft] = useState('');

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || isSending) return;
    setDraft('');
    await onSend(text);
  };

  return (
    <div className="space-y-3">
      <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
        {!messages.length ? (
          <p className="text-sm text-slate-500">No messages yet.</p>
        ) : (
          messages.map((message, index) => (
            <div key={`${message.author}-${index}`} className="mb-3 last:mb-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {message.author === 'user' ? 'You' : 'Agent'}
              </p>
              {message.text && <p className="mt-1 text-sm text-slate-800">{message.text}</p>}
            </div>
          ))
        )}
      </div>
      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          disabled={isSending}
          rows={2}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isSending || !draft.trim()}
          onClick={() => void handleSend()}
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Send to agent
        </Button>
      </div>
    </div>
  );
}
