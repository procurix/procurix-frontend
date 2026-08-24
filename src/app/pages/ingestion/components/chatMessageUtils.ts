import type { FactSessionMessage } from '@/app/services/api/ingestion';

const AUTOMATED_KICKOFF = [
  /^Extract design-steering facts from/i,
  /^Extract metric and term candidates from/i,
  /^First call set_extraction_context/i,
  /TABLE \(JSON\):/,
  /^The candidate batch has been approved/i,
  /^The cluster batch has been approved/i,
  /^Map the approved clusters to live buckets/i,
];

function isAutomatedKickoff(message: FactSessionMessage): boolean {
  const text = message.text?.trim() ?? '';
  if (!text) return false;
  return AUTOMATED_KICKOFF.some((pattern) => pattern.test(text));
}

/** Hide ADK kickoff prompts and tool-only turns — show human chat only. */
export function filterHumanChatMessages(messages: FactSessionMessage[]): FactSessionMessage[] {
  const filtered: FactSessionMessage[] = [];
  let seenHumanChat = false;

  for (const message of messages) {
    if (isAutomatedKickoff(message)) continue;

    const text = message.text?.trim() ?? '';
    const toolOnly = !text && message.tool_calls.length > 0;
    if (toolOnly) continue;

    if (message.author === 'user') {
      if (!text) continue;
      seenHumanChat = true;
      filtered.push({ ...message, tool_calls: [] });
      continue;
    }

    if (!text) continue;

    // Agent/model replies only after the reviewer has chatted.
    if (!seenHumanChat) continue;

    filtered.push({ ...message, tool_calls: [] });
  }

  return filtered;
}
