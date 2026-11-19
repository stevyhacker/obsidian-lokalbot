import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { LokalBotCliClient } from "./cli.ts";
import { buildMeetingFileName, renderMeetingNote } from "./markdown.ts";
import type { ActionEntry, LokalBotSettings, MeetingListEntry } from "./types.ts";

export interface SyncSummary {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
}

export async function ensureFolderExists(app: App, folderPath: string): Promise<string> {
  const normalized = normalizePath(folderPath.trim() || "Meetings");
  const segments = normalized.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    const existing = app.vault.getAbstractFileByPath(current);
    if (!existing) {
      await app.vault.createFolder(current);
    } else if (!(existing instanceof TFolder)) {
      throw new Error(`Cannot create folder "${current}" because a file already exists there.`);
    }
  }
  return normalized;
}

export function findExistingMeetingFile(
  app: App,
  meetingId: string,
  meetingUuid?: string,
): TFile | null {
  const files = app.vault.getMarkdownFiles();
  for (const file of files) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!fm) continue;
    const fmId = typeof fm.lokalbot_id === "string" ? fm.lokalbot_id : "";
    const fmUuid = typeof fm.lokalbot_uuid === "string" ? fm.lokalbot_uuid : "";
    if ((fmId && fmId === meetingId) || (meetingUuid && fmUuid && fmUuid === meetingUuid)) {
      return file;
    }
  }
  return null;
}

export async function importMeetingToVault(
  app: App,
  cli: LokalBotCliClient,
  settings: LokalBotSettings,
  meetingId: string,
  options: { overwrite?: boolean } = {},
): Promise<{ file: TFile; status: "created" | "updated" | "existing" }> {
  const detail = await cli.getMeeting(meetingId, settings.includeTranscript);
  const existing = findExistingMeetingFile(app, detail.id, detail.uuid);
  if (existing && !options.overwrite) {
    return { file: existing, status: "existing" };
  }

  let actions: ActionEntry[] = [];
  if (settings.includeActionsInNote) {
    try {
      actions = await cli.listActions({
        meetingId: detail.id,
        status: "all",
        limit: 50,
      });
    } catch {
      actions = [];
    }
  }

  const content = renderMeetingNote(detail, {
    includeTranscript: settings.includeTranscript,
    collapseTranscript: settings.collapseTranscript,
    actions,
  });

  if (existing) {
    await app.vault.modify(existing, content);
    return { file: existing, status: "updated" };
  }

  const folder = await ensureFolderExists(app, settings.meetingsFolder);
  const baseName = buildMeetingFileName(detail);
  let targetPath = normalizePath(`${folder}/${baseName}`);
  if (app.vault.getAbstractFileByPath(targetPath)) {
    const stem = baseName.replace(/\.md$/i, "");
    targetPath = normalizePath(`${folder}/${stem} (${detail.id}).md`);
  }
  const file = await app.vault.create(targetPath, content);
  return { file, status: "created" };
}

export async function syncRecentMeetingsToVault(
  app: App,
  cli: LokalBotCliClient,
  settings: LokalBotSettings,
): Promise<SyncSummary> {
  const meetings: MeetingListEntry[] = await cli.listMeetings(settings.syncLimit);
  const summary: SyncSummary = { imported: 0, updated: 0, skipped: 0, failed: 0 };

  for (const meeting of meetings) {
    if (meeting.sample) {
      continue;
    }
    const existing = findExistingMeetingFile(app, meeting.id, meeting.uuid);
    if (existing && settings.skipExistingOnSync) {
      summary.skipped += 1;
      continue;
    }
    try {
      const result = await importMeetingToVault(app, cli, settings, meeting.id, {
        overwrite: !settings.skipExistingOnSync,
      });
      if (result.status === "created") {
        summary.imported += 1;
      } else if (result.status === "updated") {
        summary.updated += 1;
      } else {
        summary.skipped += 1;
      }
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}
