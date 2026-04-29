export interface DeepWikiReference {
  file_path: string;
  range_start: number;
  range_end: number;
}

export interface DeepWikiResponseEventBase {
  type: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface DeepWikiChunkEvent extends DeepWikiResponseEventBase {
  type: 'chunk';
  data: string;
}

export interface DeepWikiReferenceEvent extends DeepWikiResponseEventBase {
  type: 'reference';
  data: DeepWikiReference;
}

export interface DeepWikiFileContentsEvent extends DeepWikiResponseEventBase {
  type: 'file_contents';
  data: [repoName: string, filePath: string, contents: string];
}

export interface DeepWikiLoadingIndexesEvent extends DeepWikiResponseEventBase {
  type: 'loading_indexes';
  data: {
    all_done: boolean;
  };
}

export type DeepWikiResponseEvent =
  | DeepWikiChunkEvent
  | DeepWikiReferenceEvent
  | DeepWikiFileContentsEvent
  | DeepWikiLoadingIndexesEvent
  | DeepWikiResponseEventBase;

export interface DeepWikiQuery {
  message_id: string;
  user_query: string;
  engine_id: string;
  model?: string;
  repo_names?: string[];
  repo_context_ids?: string[];
  repos?: Array<{ name: string; branch: string | null }>;
  state: string;
  error: unknown;
  redis_stream?: string | null;
  response: DeepWikiResponseEvent[];
}

export interface DeepWikiQuerySession {
  title: string;
  org_id?: string;
  queries: DeepWikiQuery[];
}
