import { App, MarkdownView, Modal, Notice } from "obsidian";
import type LokalBotPlugin from "./main.ts";
import { extractDatePrefix, formatAskCallout } from "./markdown.ts";
import type { AskOutcome, SearchHit } from "./types.ts";
import { importMeetingToVault } from "./vault-sync.ts";

export class SearchMeetingsModal extends Modal {
  private queryInputEl: HTMLInputElement | null = null;
  private resultsEl: HTMLElement | null = null;
  private debounceTimer: number | null = null;
  private searchSeq = 0;

  constructor(app: App, private readonly plugin: LokalBotPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lokalbot-modal");

    contentEl.createEl("h2", { text: "Search LokalBot meetings" });

    const input = contentEl.createEl("input", {
      type: "search",
      cls: "lokalbot-search-input",
      attr: { placeholder: "Search meeting titles, summaries, and transcripts..." },
    });
    this.queryInputEl = input;
    this.resultsEl = contentEl.createDiv({ cls: "lokalbot-modal-results" });
    this.resultsEl.createEl("p", {
      cls: "lokalbot-muted",
      text: "Type keywords or an exact quoted phrase to search locally.",
    });

    input.addEventListener("input", () => {
      if (this.debounceTimer !== null) {
        window.clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = window.setTimeout(() => {
        void this.runSearch(input.value);
      }, 220);
    });

    input.focus();
  }

  onClose(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.contentEl.empty();
  }

  private async runSearch(rawQuery: string): Promise<void> {
    if (!this.resultsEl) return;
    const query = rawQuery.trim();
    const seq = ++this.searchSeq;
    this.resultsEl.empty();

    if (!query) {
      this.resultsEl.createEl("p", {
        cls: "lokalbot-muted",
        text: "Type keywords or an exact quoted phrase to search locally.",
      });
      return;
    }

    this.resultsEl.createEl("p", { cls: "lokalbot-muted", text: "Searching..." });

    try {
      const hits = await this.plugin.cli.searchMeetings(query, 25);
      if (seq !== this.searchSeq || !this.resultsEl) return;
      this.resultsEl.empty();

      if (hits.length === 0) {
        this.resultsEl.createEl("p", {
          cls: "lokalbot-muted",
          text: "No matching passages found.",
        });
        return;
      }

      for (const hit of hits) {
        this.renderHit(this.resultsEl, hit);
      }
    } catch (err) {
      if (seq !== this.searchSeq || !this.resultsEl) return;
      this.resultsEl.empty();
      this.resultsEl.createEl("p", {
        cls: "lokalbot-error",
        text: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private renderHit(parent: HTMLElement, hit: SearchHit): void {
    const card = parent.createDiv({ cls: "lokalbot-card" });
    const header = card.createDiv({ cls: "lokalbot-card-header" });
    header.createSpan({ cls: "lokalbot-card-title", text: hit.meeting_title });
    const meta = [hit.match_kind, hit.timestamp].filter(Boolean).join(" · ");
    if (meta) {
      header.createSpan({ cls: "lokalbot-badge", text: meta });
    }
    card.createEl("p", { cls: "lokalbot-snippet", text: hit.snippet });

    const actions = card.createDiv({ cls: "lokalbot-card-actions" });
    const openBtn = actions.createEl("button", { text: "Import and open" });
    openBtn.addEventListener("click", () => {
      void this.openMeeting(hit.meeting_id);
    });

    const insertBtn = actions.createEl("button", { text: "Insert quote" });
    insertBtn.addEventListener("click", () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const stamp = hit.timestamp ? ` (${hit.timestamp})` : "";
      const quote = `> ${hit.snippet.trim()}\n> — *${hit.meeting_title}*${stamp}\n`;
      if (view) {
        view.editor.replaceSelection(quote);
        new Notice("Inserted quote into active note.");
        this.close();
      } else {
        void navigator.clipboard.writeText(quote);
        new Notice("Copied quote to clipboard.");
      }
    });
  }

  private async openMeeting(meetingId: string): Promise<void> {
    try {
      const result = await importMeetingToVault(
        this.app,
        this.plugin.cli,
        this.plugin.settings,
        meetingId,
      );
      await this.app.workspace.getLeaf(false).openFile(result.file);
      this.close();
    } catch (err) {
      new Notice(err instanceof Error ? err.message : String(err));
    }
  }
}

export class AskLokalBotModal extends Modal {
  private resultEl: HTMLElement | null = null;
  private lastQuestion = "";
  private lastOutcome: AskOutcome | null = null;

  constructor(app: App, private readonly plugin: LokalBotPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lokalbot-modal");

    contentEl.createEl("h2", { text: "Ask LokalBot" });
    contentEl.createEl("p", {
      cls: "lokalbot-muted",
      text: "Answers run on LokalBot's local model and cite the meetings they drew from.",
    });

    const form = contentEl.createEl("form", { cls: "lokalbot-ask-form" });
    const input = form.createEl("input", {
      type: "text",
      cls: "lokalbot-search-input",
      attr: { placeholder: "What did we decide about..." },
    });
    const submitBtn = form.createEl("button", {
      type: "submit",
      cls: "mod-cta",
      text: "Ask",
    });

    this.resultEl = contentEl.createDiv({ cls: "lokalbot-ask-result" });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const question = input.value.trim();
      if (!question) return;
      void this.runAsk(question, submitBtn);
    });

    input.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async runAsk(question: string, submitBtn: HTMLButtonElement): Promise<void> {
    if (!this.resultEl) return;
    submitBtn.disabled = true;
    this.resultEl.empty();
    this.resultEl.createEl("p", {
      cls: "lokalbot-muted",
      text: "Asking LokalBot's local model (first answer after cold start may take up to a minute)...",
    });

    try {
      const outcome = await this.plugin.cli.askLibrary(question);
      this.lastQuestion = question;
      this.lastOutcome = outcome;
      this.renderOutcome(outcome);
    } catch (err) {
      this.resultEl.empty();
      this.resultEl.createEl("p", {
        cls: "lokalbot-error",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      submitBtn.disabled = false;
    }
  }

  private renderOutcome(outcome: AskOutcome): void {
    if (!this.resultEl) return;
    this.resultEl.empty();

    const answerBox = this.resultEl.createDiv({ cls: "lokalbot-card" });
    answerBox.createEl("p", { cls: "lokalbot-answer-text", text: outcome.text });

    if (outcome.sources && outcome.sources.length > 0) {
      answerBox.createDiv({ cls: "lokalbot-section-label", text: "Sources" });
      const list = answerBox.createEl("ul", { cls: "lokalbot-source-list" });
      for (const source of outcome.sources) {
        const item = list.createEl("li");
        const link = item.createEl("a", {
          text: `${source.title} (${extractDatePrefix(source.date)})`,
          href: "#",
        });
        link.addEventListener("click", (e) => {
          e.preventDefault();
          void this.openSource(source.meeting_id);
        });
      }
    }

    const actions = this.resultEl.createDiv({ cls: "lokalbot-card-actions" });
    const insertBtn = actions.createEl("button", {
      cls: "mod-cta",
      text: "Insert into active note",
    });
    insertBtn.addEventListener("click", () => {
      if (!this.lastOutcome) return;
      const md = formatAskCallout(this.lastQuestion, this.lastOutcome);
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view) {
        view.editor.replaceSelection(md);
        new Notice("Inserted answer into active note.");
        this.close();
      } else {
        void navigator.clipboard.writeText(md);
        new Notice("Copied answer to clipboard.");
      }
    });

    const copyBtn = actions.createEl("button", { text: "Copy Markdown" });
    copyBtn.addEventListener("click", () => {
      if (!this.lastOutcome) return;
      void navigator.clipboard.writeText(
        formatAskCallout(this.lastQuestion, this.lastOutcome),
      );
      new Notice("Copied answer to clipboard.");
    });
  }

  private async openSource(meetingId: string): Promise<void> {
    try {
      const result = await importMeetingToVault(
        this.app,
        this.plugin.cli,
        this.plugin.settings,
        meetingId,
      );
      await this.app.workspace.getLeaf(false).openFile(result.file);
      this.close();
    } catch (err) {
      new Notice(err instanceof Error ? err.message : String(err));
    }
  }
}
