import { useState, useCallback } from 'react';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8090/api';

export interface AgentHistoryMessage {
  role: 'user' | 'model';
  content: string;
}

export interface AgentResponse {
  type: 'message' | 'tool_result';
  message: string;
  tool_called: string | null;
  data: unknown;
}

interface AgentSendOptions {
  mode?: string;
}

interface UseAgentOptions {
  onToolResult?: (tool: string, data: unknown) => void;
}

export function useAgent(designId: string, stage: string, options: UseAgentOptions = {}) {
  const [history, setHistory] = useState<AgentHistoryMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const { onToolResult } = options;

  const send = useCallback(async (message: string, sendOptions: AgentSendOptions = {}): Promise<AgentResponse> => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/designs/${designId}/agent/${stage}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, mode: sendOptions.mode }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? 'Agent request failed');
      }
      const response: AgentResponse = await res.json();

      // Append both turns to history for next call
      setHistory(prev => [
        ...prev,
        { role: 'user', content: message },
        { role: 'model', content: response.message },
      ]);

      if (response.type === 'tool_result' && response.tool_called) {
        onToolResult?.(response.tool_called, response.data);
      }

      return response;
    } finally {
      setLoading(false);
    }
  }, [designId, stage, history, onToolResult]);

  const reset = useCallback(() => setHistory([]), []);

  return { send, loading, history, reset };
}
