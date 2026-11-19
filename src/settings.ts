import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type LokalBotPlugin from "./main.ts";

export class LokalBotSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: LokalBotPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Vault notes").setHeading();

    new Setting(containerEl)
      .setName("Meetings folder")
      .setDesc("Vault folder where imported meeting notes are saved.")
      .addText((text) =>
        text
          .setPlaceholder("Meetings")
          .setValue(this.plugin.settings.meetingsFolder)
          .onChange(async (value) => {
            this.plugin.settings.meetingsFolder = value.trim() || "Meetings";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Include full transcript")
      .setDesc("Include the meeting transcript when importing notes into your vault.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeTranscript)
          .onChange(async (value) => {
            this.plugin.settings.includeTranscript = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Collapse transcript in callout")
      .setDesc("Wrap imported transcripts inside a folded callout block to keep notes compact.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.collapseTranscript)
          .onChange(async (value) => {
            this.plugin.settings.collapseTranscript = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Include action items section")
      .setDesc("Add the meeting's action items as checkboxes at the top of imported notes.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeActionsInNote)
          .onChange(async (value) => {
            this.plugin.settings.includeActionsInNote = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("Sync & actions").setHeading();

    new Setting(containerEl)
      .setName("Skip existing notes on sync")
      .setDesc("Keep notes already imported by lokalbot_id untouched during batch sync.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.skipExistingOnSync)
          .onChange(async (value) => {
            this.plugin.settings.skipExistingOnSync = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Recent meetings to sync")
      .setDesc("Maximum number of recent meetings checked when running sync.")
      .addSlider((slider) =>
        slider
          .setLimits(5, 100, 5)
          .setValue(this.plugin.settings.syncLimit)
          .onChange(async (value) => {
            this.plugin.settings.syncLimit = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Action item lookback (days)")
      .setDesc("How many days of meetings to scan when listing open action items.")
      .addSlider((slider) =>
        slider
          .setLimits(7, 180, 7)
          .setValue(this.plugin.settings.actionLookbackDays)
          .onChange(async (value) => {
            this.plugin.settings.actionLookbackDays = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName("Local CLI connection").setHeading();

    new Setting(containerEl)
      .setName("Path to lokalbot-cli")
      .setDesc("Leave blank to auto-detect on macOS, Windows, and Linux.")
      .addText((text) =>
        text
          .setPlaceholder("Auto-detect")
          .setValue(this.plugin.settings.cliPath)
          .onChange(async (value) => {
            this.plugin.settings.cliPath = value.trim();
            this.plugin.cli.resetCache();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Verify that lokalbot-cli is reachable and meeting access is enabled.")
      .addButton((button) =>
        button.setButtonText("Test").onClick(async () => {
          button.setDisabled(true);
          try {
            const info = await this.plugin.cli.getVersion();
            const meetings = await this.plugin.cli.listMeetings(1);
            new Notice(
              `Connected to ${info.version} (${info.path}). ${meetings.length > 0 ? "Meeting library readable." : "No meetings recorded yet."}`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            new Notice(`LokalBot check failed: ${msg}`);
          } finally {
            button.setDisabled(false);
          }
        }),
      );
  }
}
