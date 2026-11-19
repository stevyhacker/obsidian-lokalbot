export interface LokalBotSettings {
  cliPath: string;
  meetingsFolder: string;
  includeTranscript: boolean;
  collapseTranscript: boolean;
  includeActionsInNote: boolean;
  skipExistingOnSync: boolean;
  syncLimit: number;
  actionLookbackDays: number;
}

export const DEFAULT_SETTINGS: LokalBotSettings = {
  cliPath: "",
  meetingsFolder: "Meetings",
  includeTranscript: true,
  collapseTranscript: true,
  includeActionsInNote: true,
  skipExistingOnSync: true,
  syncLimit: 20,
  actionLookbackDays: 30,
};

export interface MeetingListEntry {
  id: string;
  uuid?: string;
  title: string;
  date: string;
  duration_seconds: number;
  app_source: string;
  has_system_track: boolean;
  has_summary: boolean;
  has_transcript: boolean;
  summary?: string;
  summary_truncated?: boolean;
  sample?: boolean;
}

export interface MeetingDetail {
  id: string;
  uuid?: string;
  title: string;
  date: string;
  duration_seconds: number;
  app_source: string;
  has_system_track: boolean;
  summary?: string;
  transcript?: string;
  folder?: string;
  sample?: boolean;
}

export interface SearchHit {
  meeting_id: string;
  meeting_title: string;
  match_kind: string;
  snippet: string;
  timestamp?: string;
  sample?: boolean;
}

export interface ActionMeetingRef {
  id: string;
  title: string;
  date: string;
}

export interface ActionEntry {
  text: string;
  owner?: string;
  for_user: boolean;
  due?: string;
  due_date?: string;
  overdue: boolean;
  status: string;
  mention_count: number;
  meetings: ActionMeetingRef[];
}

export interface AskSource {
  meeting_id: string;
  title: string;
  date: string;
}

export interface AskOutcome {
  status: "answered" | "not_found" | "error";
  code?: string;
  text: string;
  sources: AskSource[];
}
