import type { ActionEntry, AskOutcome, MeetingDetail } from "./types.ts";

export interface MeetingNoteOptions {
  includeTranscript: boolean;
  collapseTranscript: boolean;
  actions?: ActionEntry[];
}

export function extractDatePrefix(isoDate: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(isoDate.trim());
  return match ? match[1] : "undated";
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0m";
  }
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 1) {
    return "<1m";
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function sanitizeFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/g, "");
  return (cleaned || "Untitled meeting").slice(0, 96).trim();
}

export function buildMeetingFileName(meeting: {
  title: string;
  date: string;
  id: string;
}): string {
  const day = extractDatePrefix(meeting.date);
  const safeTitle = sanitizeFileName(meeting.title);
  return `${day} ${safeTitle}.md`;
}

export function escapeYamlString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ");
  return `"${escaped}"`;
}

export function formatActionChecklist(
  actions: ActionEntry[],
  options: { includeMeetingTitle?: boolean } = {},
): string {
  if (actions.length === 0) {
    return "_No open action items._";
  }
  return actions
    .map((action) => {
      const box = action.status === "done" ? "[x]" : "[ ]";
      const meta: string[] = [];
      if (action.owner) {
        meta.push(action.for_user ? `${action.owner} (me)` : action.owner);
      } else if (action.for_user) {
        meta.push("me");
      }
      if (action.due_date) {
        meta.push(`due ${action.due_date}`);
      } else if (action.due) {
        meta.push(`due ${action.due}`);
      }
      if (action.overdue) {
        meta.push("overdue");
      }
      if (options.includeMeetingTitle && action.meetings.length > 0) {
        const first = action.meetings[0];
        meta.push(`${first.title} (${extractDatePrefix(first.date)})`);
      }
      const suffix = meta.length > 0 ? ` — _${meta.join(" · ")}_` : "";
      return `- ${box} ${action.text.trim()}${suffix}`;
    })
    .join("\n");
}

function asCollapsedCallout(title: string, content: string): string {
  const bodyLines = content
    .trim()
    .split(/\r?\n/)
    .map((line) => (line.length > 0 ? `> ${line}` : ">"));
  return [`> [!note]- ${title}`, ...bodyLines].join("\n");
}

export function renderMeetingNote(
  meeting: MeetingDetail,
  options: MeetingNoteOptions,
): string {
  const lines: string[] = [
    "---",
    `title: ${escapeYamlString(meeting.title)}`,
    `date: ${escapeYamlString(meeting.date)}`,
    `duration: ${escapeYamlString(formatDuration(meeting.duration_seconds))}`,
    `source: ${escapeYamlString(meeting.app_source || "LokalBot")}`,
    `lokalbot_id: ${escapeYamlString(meeting.id)}`,
  ];
  if (meeting.uuid) {
    lines.push(`lokalbot_uuid: ${escapeYamlString(meeting.uuid)}`);
  }
  lines.push("tags:", "  - meeting", "  - lokalbot", "---", "");

  lines.push(`# ${meeting.title}`, "");
  const metaBits = [
    `**Date:** ${extractDatePrefix(meeting.date)}`,
    `**Duration:** ${formatDuration(meeting.duration_seconds)}`,
  ];
  if (meeting.app_source) {
    metaBits.push(`**App:** ${meeting.app_source}`);
  }
  lines.push(metaBits.join(" · "), "");

  if (meeting.sample) {
    lines.push(
      "> [!info] Sample meeting",
      "> Fictional sample recording bundled with LokalBot.",
      "",
    );
  }

  if (options.actions && options.actions.length > 0) {
    lines.push("## Action items", "", formatActionChecklist(options.actions), "");
  }

  if (meeting.summary && meeting.summary.trim()) {
    lines.push("## Summary", "", meeting.summary.trim(), "");
  }

  if (options.includeTranscript && meeting.transcript && meeting.transcript.trim()) {
    if (options.collapseTranscript) {
      lines.push(asCollapsedCallout("Transcript", meeting.transcript), "");
    } else {
      lines.push("## Transcript", "", meeting.transcript.trim(), "");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function formatAskCallout(question: string, outcome: AskOutcome): string {
  const answerLines = (outcome.text || "No matching evidence found in LokalBot.")
    .trim()
    .split(/\r?\n/)
    .map((line) => (line.length > 0 ? `> ${line}` : ">"));

  const out: string[] = [`> [!quote] LokalBot: ${question.trim()}`, ...answerLines];
  if (outcome.sources && outcome.sources.length > 0) {
    out.push(">", "> **Sources:**");
    for (const source of outcome.sources) {
      out.push(
        `> - ${source.title} (${extractDatePrefix(source.date)}, \`${source.meeting_id}\`)`,
      );
    }
  }
  return `${out.join("\n")}\n`;
}
