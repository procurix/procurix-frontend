import type {
  IngestionDocument,
  IngestionDocumentPipeline,
  IngestionJob,
} from '@/app/services/api/ingestion';
import { chunkDisplayTitle } from '@/app/pages/ingestion/components/chunkUtils';

export type InboxItemKind =
  | 'parse_running'
  | 'table_review'
  | 'fact_drafting'
  | 'fact_review'
  | 'fact_commit'
  | 'ner_drafting'
  | 'ner_review'
  | 'ner_advance'
  | 'ner_persist';

export type InboxTab = 'table' | 'facts' | 'terms';

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
  priority: number;
  title: string;
  subtitle: string;
  documentId: string;
  documentFilename: string;
  chunkId?: string;
  sessionId?: string;
  updatedAt: string;
  tab: InboxTab;
}

const KIND_PRIORITY: Record<InboxItemKind, number> = {
  fact_review: 1,
  ner_review: 2,
  fact_commit: 3,
  ner_persist: 4,
  table_review: 5,
  ner_advance: 6,
  fact_drafting: 7,
  ner_drafting: 8,
  parse_running: 9,
};

const KIND_LABELS: Record<InboxItemKind, string> = {
  parse_running: 'Parsing',
  table_review: 'Table review',
  fact_drafting: 'Fact extraction',
  fact_review: 'Fact review',
  fact_commit: 'Commit facts',
  ner_drafting: 'NER extraction',
  ner_review: 'NER review',
  ner_advance: 'Advance NER',
  ner_persist: 'Persist vocabulary',
};

export function inboxKindLabel(kind: InboxItemKind): string {
  return KIND_LABELS[kind];
}

export function buildDocumentWorkspaceHref(
  documentId: string,
  chunkId?: string,
  tab?: InboxTab,
): string {
  const params = new URLSearchParams();
  if (chunkId) params.set('chunk', chunkId);
  if (tab) params.set('tab', tab);
  const query = params.toString();
  return `/ingestion/documents/${documentId}${query ? `?${query}` : ''}`;
}

function pushItem(items: InboxItem[], item: Omit<InboxItem, 'priority'>): void {
  items.push({ ...item, priority: KIND_PRIORITY[item.kind] });
}

export function buildInboxItemsFromPipeline(
  pipeline: IngestionDocumentPipeline,
): InboxItem[] {
  const items: InboxItem[] = [];
  const { document } = pipeline;

  for (const job of pipeline.jobs) {
    if (job.kind === 'parse' && (job.status === 'queued' || job.status === 'running')) {
      pushItem(items, {
        id: `parse-${job.id}`,
        kind: 'parse_running',
        title: `Parsing ${document.filename}`,
        subtitle: 'Spreadsheet is being parsed into table chunks',
        documentId: document.id,
        documentFilename: document.filename,
        updatedAt: job.updated_at,
        tab: 'table',
      });
    }
  }

  for (const entry of pipeline.chunks) {
    const { chunk, fact_session, ner_session } = entry;
    const chunkTitle = chunkDisplayTitle(chunk.metadata, chunk.id);

    if (chunk.status !== 'committed') {
      pushItem(items, {
        id: `table-${chunk.id}`,
        kind: 'table_review',
        title: chunkTitle,
        subtitle: `${document.filename} — review and commit the parsed table`,
        documentId: document.id,
        documentFilename: document.filename,
        chunkId: chunk.id,
        updatedAt: chunk.updated_at,
        tab: 'table',
      });
      continue;
    }

    if (fact_session) {
      if (fact_session.status === 'awaiting_review') {
        pushItem(items, {
          id: `fact-review-${fact_session.id}`,
          kind: 'fact_review',
          title: chunkTitle,
          subtitle: `${document.filename} — approve or edit the fact batch`,
          documentId: document.id,
          documentFilename: document.filename,
          chunkId: chunk.id,
          sessionId: fact_session.id,
          updatedAt: fact_session.updated_at,
          tab: 'facts',
        });
      } else if (fact_session.status === 'reviewed') {
        pushItem(items, {
          id: `fact-commit-${fact_session.id}`,
          kind: 'fact_commit',
          title: chunkTitle,
          subtitle: `${document.filename} — persist reviewed facts`,
          documentId: document.id,
          documentFilename: document.filename,
          chunkId: chunk.id,
          sessionId: fact_session.id,
          updatedAt: fact_session.updated_at,
          tab: 'facts',
        });
      } else if (fact_session.status === 'created' || fact_session.status === 'drafting') {
        pushItem(items, {
          id: `fact-draft-${fact_session.id}`,
          kind: 'fact_drafting',
          title: chunkTitle,
          subtitle: `${document.filename} — fact agent is drafting`,
          documentId: document.id,
          documentFilename: document.filename,
          chunkId: chunk.id,
          sessionId: fact_session.id,
          updatedAt: fact_session.updated_at,
          tab: 'facts',
        });
      }
    }

    if (ner_session) {
      if (ner_session.status === 'awaiting_review') {
        pushItem(items, {
          id: `ner-review-${ner_session.id}`,
          kind: 'ner_review',
          title: chunkTitle,
          subtitle: `${document.filename} — review ${ner_session.stage} batch`,
          documentId: document.id,
          documentFilename: document.filename,
          chunkId: chunk.id,
          sessionId: ner_session.id,
          updatedAt: ner_session.updated_at,
          tab: 'terms',
        });
      } else if (
        ner_session.status === 'reviewed' &&
        ner_session.stage === 'mapping'
      ) {
        pushItem(items, {
          id: `ner-persist-${ner_session.id}`,
          kind: 'ner_persist',
          title: chunkTitle,
          subtitle: `${document.filename} — persist buckets and mention lineage`,
          documentId: document.id,
          documentFilename: document.filename,
          chunkId: chunk.id,
          sessionId: ner_session.id,
          updatedAt: ner_session.updated_at,
          tab: 'terms',
        });
      } else if (
        ner_session.status === 'reviewed' &&
        ner_session.stage !== 'mapping'
      ) {
        pushItem(items, {
          id: `ner-advance-${ner_session.id}`,
          kind: 'ner_advance',
          title: chunkTitle,
          subtitle: `${document.filename} — advance from ${ner_session.stage} stage`,
          documentId: document.id,
          documentFilename: document.filename,
          chunkId: chunk.id,
          sessionId: ner_session.id,
          updatedAt: ner_session.updated_at,
          tab: 'terms',
        });
      } else if (ner_session.status === 'created' || ner_session.status === 'drafting') {
        pushItem(items, {
          id: `ner-draft-${ner_session.id}`,
          kind: 'ner_drafting',
          title: chunkTitle,
          subtitle: `${document.filename} — ${ner_session.stage} agent is drafting`,
          documentId: document.id,
          documentFilename: document.filename,
          chunkId: chunk.id,
          sessionId: ner_session.id,
          updatedAt: ner_session.updated_at,
          tab: 'terms',
        });
      }
    }
  }

  return items;
}

export function sortInboxItems(items: InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function appendActiveJobItems(
  items: InboxItem[],
  documents: IngestionDocument[],
  activeJobs: IngestionJob[],
): InboxItem[] {
  const existingJobIds = new Set(items.map((item) => item.id));

  for (const job of activeJobs) {
    if (job.status !== 'queued' && job.status !== 'running') continue;
    if (!job.document_id) continue;
    const doc = documents.find((d) => d.id === job.document_id);
    if (!doc) continue;

    if (job.kind === 'fact_draft') {
      const id = `job-fact-${job.id}`;
      if (existingJobIds.has(id)) continue;
      pushItem(items, {
        id,
        kind: 'fact_drafting',
        title: doc.filename,
        subtitle: 'Fact extraction job running',
        documentId: doc.id,
        documentFilename: doc.filename,
        chunkId: job.chunk_id ?? undefined,
        sessionId: job.session_id ?? undefined,
        updatedAt: job.updated_at,
        tab: 'facts',
      });
    } else if (job.kind === 'ner_draft' || job.kind === 'ner_advance') {
      const id = `job-ner-${job.id}`;
      if (existingJobIds.has(id)) continue;
      pushItem(items, {
        id,
        kind: 'ner_drafting',
        title: doc.filename,
        subtitle: `NER ${job.kind.replace('_', ' ')} job running`,
        documentId: doc.id,
        documentFilename: doc.filename,
        chunkId: job.chunk_id ?? undefined,
        sessionId: job.session_id ?? undefined,
        updatedAt: job.updated_at,
        tab: 'terms',
      });
    }
  }

  return sortInboxItems(items);
}
