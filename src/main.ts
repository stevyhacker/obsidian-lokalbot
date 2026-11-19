import { Editor, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { LokalBotCliClient } from "./cli.ts";
import { formatActionChecklist } from "./markdown.ts";
import { AskLokalBotModal, SearchMeetingsModal } from "./modals.ts";
import { LokalBotSettingTab } from "./settings.ts";
import { LokalBotSidebarView, VIEW_TYPE_LOKALBOT } from "./sidebar.ts";
import { DEFAULT_SETTINGS, type LokalBotSettings } from "./types.ts";
import { syncRecentMeetingsToVault } from "./vault-sync.ts";

export default class LokalBotPlugin extends Plugin {
  settings: LokalBotSettings = { ...DEFAULT_SETTINGS };
  cli!: LokalBotCliClient;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.cli = new LokalBotCliClient(() => this.settings.cliPath);

    this.registerView(
      VIEW_TYPE_LOKALBOT,
      (leaf) => new LokalBotSidebarView(leaf, this),
    );

    this.addRibbonIcon("mic", "Open LokalBot meetings", () => {
      void this.activateSidebar();
    });

    this.addCommand({
      id: "open-sidebar",
      name: "Open meetings sidebar",
      callback: () => {
        void this.activateSidebar();
      },
    });

    this.addCommand({
      id: "search-meetings",
      name: "Search meetings",
      callback: () => {
        new SearchMeetingsModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "sync-recent-meetings",
      name: "Sync recent meetings to vault",
      callback: async () => {
        try {
          const summary = await syncRecentMeetingsToVault(
            this.app,
            this.cli,
            this.settings,
          );
          new Notice(
            `LokalBot sync: ${summary.imported} imported, ${summary.updated} updated, ${summary.skipped} skipped${summary.failed > 0 ? `, ${summary.failed} failed` : ""}.`,
          );
        } catch (err) {
          new Notice(err instanceof Error ? err.message : String(err));
        }
      },
    });

    this.addCommand({
      id: "insert-open-actions",
      name: "Insert open action items",
      editorCallback: async (editor: Editor) => {
        try {
          const actions = await this.cli.listActions({
            days: this.settings.actionLookbackDays,
            status: "active",
            limit: 50,
          });
          const checklist = formatActionChecklist(actions, {
            includeMeetingTitle: true,
          });
          editor.replaceSelection(`${checklist}\n`);
          new Notice(`Inserted ${actions.length} open action items.`);
        } catch (err) {
          new Notice(err instanceof Error ? err.message : String(err));
        }
      },
    });

    this.addCommand({
      id: "ask-meetings",
      name: "Ask about your meetings",
      callback: () => {
        new AskLokalBotModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "insert-briefing",
      name: "Insert catch-up briefing",
      editorCallback: async (editor: Editor) => {
        try {
          const briefing = await this.cli.getBriefing();
          editor.replaceSelection(`${briefing.trim()}\n`);
          new Notice("Inserted LokalBot catch-up briefing.");
        } catch (err) {
          new Notice(err instanceof Error ? err.message : String(err));
        }
      },
    });

    this.addSettingTab(new LokalBotSettingTab(this.app, this));
  }

  async activateSidebar(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_LOKALBOT);
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_LOKALBOT, active: true });
      }
    }
    if (leaf) {
      await workspace.revealLeaf(leaf);
    }
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<LokalBotSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
