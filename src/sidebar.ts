import { ItemView, MarkdownView, Notice, WorkspaceLeaf } from "obsidian";
import {
  AccessDisabledError,
  CliMissingError,
  installHintForPlatform,
} from "./cli.ts";
import type LokalBotPlugin from "./main.ts";
import {
  extractDatePrefix,
  formatActionChecklist,
  formatDuration,
} from "./markdown.ts";
import type { ActionEntry, MeetingListEntry, SearchHit } from "./types.ts";
import {
  findExistingMeetingFile,
  importMeetingToVault,
  syncRecentMeetingsToVault,
} from "./vault-sync.ts";

export const VIEW_TYPE_LOKALBOT = "lokalbot-sidebar";

type ActiveTab = "meetings" | "actions" | "search";

export class LokalBotSidebarView extends ItemView {
  private activeTab: ActiveTab = "meetings";
  private bodyEl: HTMLElement | null = null;
  private lastSearchQuery = "";

  constructor(leaf: WorkspaceLeaf, private readonly plugin: LokalBotPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_LOKALBOT;
  }

  getDisplayText(): string {
    return "LokalBot";
  }

  getIcon(): string {
    return "mic";
  }

  async onOpen(): Promise<void> {
    this.renderShell();
    await this.refresh();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  private renderShell(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("lokalbot-sidebar");

    const top = root.createDiv({ cls: "lokalbot-header" });
    top.createSpan({ cls: "lokalbot-title", text: "LokalBot" });

    const controls = top.createDiv({ cls: "lokalbot-header-actions" });
    const syncBtn = controls.createEl("button", {
      cls: "lokalbot-icon-btn",
      text: "Sync",
      attr: { "aria-label": "Sync recent meetings to vault" },
    });
    syncBtn.addEventListener("click", () => {
      void this.runSync(syncBtn);
    });

    const refreshBtn = controls.createEl("button", {
      cls: "lokalbot-icon-btn",
      text: "Refresh",
      attr: { "aria-label": "Refresh view" },
    });
    refreshBtn.addEventListener("click", () => {
      void this.refresh();
    });

    const tabs = root.createDiv({ cls: "lokalbot-tabs" });
    const tabDefs: Array<{ id: ActiveTab; label: string }> = [
      { id: "meetings", label: "Meetings" },
      { id: "actions", label: "Actions" },
      { id: "search", label: "Search" },
    ];
    for (const def of tabDefs) {
      const btn = tabs.createEl("button", {
        cls: `lokalbot-tab ${this.activeTab === def.id ? "is-active" : ""}`,
        text: def.label,
      });
      btn.addEventListener("click", () => {
        this.activeTab = def.id;
        this.renderShell();
        void this.refresh();
      });
    }

    this.bodyEl = root.createDiv({ cls: "lokalbot-body" });
  }

  async refresh(): Promise<void> {
    if (!this.bodyEl) return;
    this.bodyEl.empty();

    if (this.activeTab === "search") {
      this.renderSearchTab(this.bodyEl);
      return;
    }

    this.bodyEl.createEl("p", { cls: "lokalbot-muted", text: "Loading..." });
    try {
      if (this.activeTab === "meetings") {
        const meetings = await this.plugin.cli.listMeetings(25);
        this.renderMeetingsList(this.bodyEl, meetings);
      } else {
        const actions = await this.plugin.cli.listActions({
          days: this.plugin.settings.actionLookbackDays,
          status: "active",
          limit: 50,
        });
        this.renderActionsList(this.bodyEl, actions);
      }
    } catch (err) {
      this.renderErrorState(this.bodyEl, err);
    }
  }

  private renderMeetingsList(container: HTMLElement, meetings: MeetingListEntry[]): void {
    container.empty();
    if (meetings.length === 0) {
      container.createEl("p", {
        cls: "lokalbot-muted",
        text: "No meetings found in LokalBot yet.",
      });
      return;
    }

    for (const meeting of meetings) {
      const card = container.createDiv({ cls: "lokalbot-card" });
      card.createDiv({ cls: "lokalbot-card-title", text: meeting.title });
      const meta = [
        extractDatePrefix(meeting.date),
        formatDuration(meeting.duration_seconds),
        meeting.app_source,
      ]
        .filter(Boolean)
        .join(" · ");
      card.createDiv({ cls: "lokalbot-card-meta", text: meta });

      const existing = findExistingMeetingFile(this.app, meeting.id, meeting.uuid);
      const row = card.createDiv({ cls: "lokalbot-card-actions" });
      const btn = row.createEl("button", {
        cls: existing ? "" : "mod-cta",
        text: existing ? "Open note" : "Import note",
      });
      btn.addEventListener("click", () => {
        void this.openOrImportMeeting(meeting.id, btn);
      });

      if (existing) {
        const updateBtn = row.createEl("button", { text: "Refresh note" });
        updateBtn.addEventListener("click", () => {
          void this.openOrImportMeeting(meeting.id, updateBtn, true);
        });
      }
    }
  }

  private renderActionsList(container: HTMLElement, actions: ActionEntry[]): void {
    container.empty();
    if (actions.length === 0) {
      container.createEl("p", {
        cls: "lokalbot-muted",
        text: "No open action items found.",
      });
      return;
    }

    const toolbar = container.createDiv({ cls: "lokalbot-card-actions" });
    const insertAllBtn = toolbar.createEl("button", {
      cls: "mod-cta",
      text: "Insert all into note",
    });
    insertAllBtn.addEventListener("click", () => {
      const text = formatActionChecklist(actions, { includeMeetingTitle: true });
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view) {
        view.editor.replaceSelection(`${text}\n`);
        new Notice("Inserted open action items into active note.");
      } else {
        void navigator.clipboard.writeText(text);
        new Notice("Copied open action items to clipboard.");
      }
    });

    for (const action of actions) {
      const card = container.createDiv({ cls: "lokalbot-card" });
      card.createDiv({ cls: "lokalbot-card-title", text: action.text });
      const metaParts: string[] = [];
      if (action.owner) {
        metaParts.push(action.for_user ? `${action.owner} (me)` : action.owner);
      } else if (action.for_user) {
        metaParts.push("me");
      }
      if (action.due_date || action.due) {
        metaParts.push(`due ${action.due_date ?? action.due}`);
      }
      if (action.overdue) {
        metaParts.push("overdue");
      }
      if (action.meetings.length > 0) {
        metaParts.push(action.meetings[0].title);
      }
      if (metaParts.length > 0) {
        card.createDiv({
          cls: action.overdue ? "lokalbot-card-meta is-overdue" : "lokalbot-card-meta",
          text: metaParts.join(" · "),
        });
      }

      if (action.meetings.length > 0) {
        const row = card.createDiv({ cls: "lokalbot-card-actions" });
        const sourceBtn = row.createEl("button", { text: "Open meeting" });
        sourceBtn.addEventListener("click", () => {
          void this.openOrImportMeeting(action.meetings[0].id, sourceBtn);
        });
      }
    }
  }

  private renderSearchTab(container: HTMLElement): void {
    const form = container.createEl("form", { cls: "lokalbot-ask-form" });
    const input = form.createEl("input", {
      type: "search",
      cls: "lokalbot-search-input",
      value: this.lastSearchQuery,
      attr: { placeholder: "Search meetings..." },
    });
    form.createEl("button", { type: "submit", cls: "mod-cta", text: "Find" });

    const resultsEl = container.createDiv({ cls: "lokalbot-search-results" });

    const execute = async (query: string) => {
      const trimmed = query.trim();
      this.lastSearchQuery = trimmed;
      resultsEl.empty();
      if (!trimmed) {
        resultsEl.createEl("p", {
          cls: "lokalbot-muted",
          text: "Search across titles, summaries, and transcripts locally.",
        });
        return;
      }
      resultsEl.createEl("p", { cls: "lokalbot-muted", text: "Searching..." });
      try {
        const hits: SearchHit[] = await this.plugin.cli.searchMeetings(trimmed, 25);
        resultsEl.empty();
        if (hits.length === 0) {
          resultsEl.createEl("p", { cls: "lokalbot-muted", text: "No matches found." });
          return;
        }
        for (const hit of hits) {
          const card = resultsEl.createDiv({ cls: "lokalbot-card" });
          card.createDiv({ cls: "lokalbot-card-title", text: hit.meeting_title });
          const stamp = [hit.match_kind, hit.timestamp].filter(Boolean).join(" · ");
          if (stamp) {
            card.createDiv({ cls: "lokalbot-card-meta", text: stamp });
          }
          card.createEl("p", { cls: "lokalbot-snippet", text: hit.snippet });
          const row = card.createDiv({ cls: "lokalbot-card-actions" });
          const btn = row.createEl("button", { text: "Open meeting" });
          btn.addEventListener("click", () => {
            void this.openOrImportMeeting(hit.meeting_id, btn);
          });
        }
      } catch (err) {
        this.renderErrorState(resultsEl, err);
      }
    };

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      void execute(input.value);
    });

    if (this.lastSearchQuery) {
      void execute(this.lastSearchQuery);
    } else {
      resultsEl.createEl("p", {
        cls: "lokalbot-muted",
        text: "Search across titles, summaries, and transcripts locally.",
      });
    }
  }

  private renderErrorState(container: HTMLElement, err: unknown): void {
    container.empty();
    const card = container.createDiv({ cls: "lokalbot-card" });

    if (err instanceof CliMissingError) {
      const hint = installHintForPlatform();
      card.createDiv({
        cls: "lokalbot-card-title",
        text: "Install LokalBot to connect your meetings",
      });
      card.createEl("p", {
        cls: "lokalbot-snippet",
        text: "LokalBot is a free, open-source (GPLv3), local-first app that records calls without a bot and runs transcription and summaries on your computer.",
      });
      card.createDiv({ cls: "lokalbot-section-label", text: hint.title });
      const code = card.createEl("code", { cls: "lokalbot-code", text: hint.command });
      const actions = card.createDiv({ cls: "lokalbot-card-actions" });
      const copyBtn = actions.createEl("button", {
        cls: "mod-cta",
        text: "Copy command",
      });
      copyBtn.addEventListener("click", () => {
        void navigator.clipboard.writeText(code.textContent ?? hint.command);
        new Notice("Copied install command.");
      });
      const retryBtn = actions.createEl("button", { text: "Check again" });
      retryBtn.addEventListener("click", () => {
        this.plugin.cli.resetCache();
        void this.refresh();
      });
      card.createEl("p", { cls: "lokalbot-card-meta", text: hint.note });
      return;
    }

    if (err instanceof AccessDisabledError) {
      card.createDiv({
        cls: "lokalbot-card-title",
        text: "Enable meeting access in LokalBot",
      });
      card.createEl("p", {
        cls: "lokalbot-snippet",
        text: "Open LokalBot -> Settings -> External Agents (or Settings -> AI agents on Windows and Linux), allow external agents to read your LokalBot data, and enable Meetings.",
      });
      const actions = card.createDiv({ cls: "lokalbot-card-actions" });
      const retryBtn = actions.createEl("button", {
        cls: "mod-cta",
        text: "Check again",
      });
      retryBtn.addEventListener("click", () => {
        void this.refresh();
      });
      return;
    }

    card.createEl("p", {
      cls: "lokalbot-error",
      text: err instanceof Error ? err.message : String(err),
    });
  }

  private async openOrImportMeeting(
    meetingId: string,
    button: HTMLButtonElement,
    overwrite = false,
  ): Promise<void> {
    button.disabled = true;
    try {
      const result = await importMeetingToVault(
        this.app,
        this.plugin.cli,
        this.plugin.settings,
        meetingId,
        { overwrite },
      );
      await this.app.workspace.getLeaf(false).openFile(result.file);
      if (result.status === "created") {
        new Notice(`Imported "${result.file.basename}".`);
      } else if (result.status === "updated") {
        new Notice(`Refreshed "${result.file.basename}".`);
      }
      if (this.activeTab === "meetings") {
        await this.refresh();
      }
    } catch (err) {
      new Notice(err instanceof Error ? err.message : String(err));
    } finally {
      button.disabled = false;
    }
  }

  private async runSync(button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const summary = await syncRecentMeetingsToVault(
        this.app,
        this.plugin.cli,
        this.plugin.settings,
      );
      new Notice(
        `LokalBot sync: ${summary.imported} imported, ${summary.updated} updated, ${summary.skipped} skipped${summary.failed > 0 ? `, ${summary.failed} failed` : ""}.`,
      );
      await this.refresh();
    } catch (err) {
      new Notice(err instanceof Error ? err.message : String(err));
    } finally {
      button.disabled = false;
    }
  }
}
