import { execFile, spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type {
  ActionEntry,
  AskOutcome,
  MeetingDetail,
  MeetingListEntry,
  SearchHit,
} from "./types.ts";

const execFileAsync = promisify(execFile);

export class CliMissingError extends Error {
  constructor(message = "Could not find lokalbot-cli on this computer.") {
    super(message);
    this.name = "CliMissingError";
  }
}

export class AccessDisabledError extends Error {
  constructor(
    message = "External agent access to meetings is turned off in LokalBot.",
  ) {
    super(message);
    this.name = "AccessDisabledError";
  }
}

export class AppNotRunningError extends Error {
  constructor(
    message = "Open LokalBot so its local model can answer your question.",
  ) {
    super(message);
    this.name = "AppNotRunningError";
  }
}

export interface PlatformEnv {
  platform: NodeJS.Platform;
  homeDir: string;
  localAppData?: string;
  userProfile?: string;
}

export function candidateCliPaths(
  configuredPath: string,
  env: PlatformEnv = {
    platform: process.platform,
    homeDir: os.homedir(),
    localAppData: process.env.LOCALAPPDATA,
    userProfile: process.env.USERPROFILE,
  },
): string[] {
  const list: string[] = [];
  const trimmed = configuredPath.trim();
  if (trimmed) {
    list.push(trimmed);
  }
  list.push(env.platform === "win32" ? "lokalbot-cli.exe" : "lokalbot-cli");
  if (env.platform === "darwin") {
    list.push(
      "/Applications/LokalBot.app/Contents/Helpers/lokalbot-cli",
      path.posix.join(env.homeDir, ".local", "bin", "lokalbot-cli"),
    );
  } else if (env.platform === "win32") {
    const localAppData =
      env.localAppData || path.win32.join(env.homeDir, "AppData", "Local");
    const userProfile = env.userProfile || env.homeDir;
    list.push(
      path.win32.join(localAppData, "Programs", "LokalBot", "bin", "lokalbot-cli.exe"),
      path.win32.join(localAppData, "Programs", "LokalBot", "lokalbot-cli.exe"),
      path.win32.join(userProfile, "scoop", "shims", "lokalbot-cli.exe"),
    );
  } else {
    list.push(
      path.posix.join(env.homeDir, ".local", "bin", "lokalbot-cli"),
      "/usr/bin/lokalbot-cli",
    );
  }
  return Array.from(new Set(list));
}

export function classifyCliError(stderr: string, fallbackMessage: string): Error {
  const combined = `${stderr}\n${fallbackMessage}`;
  if (combined.includes("[access_disabled]") || /access_disabled/i.test(combined)) {
    return new AccessDisabledError();
  }
  if (combined.includes("[app_not_running]") || /app_not_running/i.test(combined)) {
    return new AppNotRunningError();
  }
  const clean = stderr.trim() || fallbackMessage.trim() || "lokalbot-cli failed.";
  return new Error(clean);
}

export function installHintForPlatform(platform: NodeJS.Platform = process.platform): {
  title: string;
  command: string;
  note: string;
} {
  if (platform === "darwin") {
    return {
      title: "Install on macOS (Apple Silicon)",
      command: "brew install --cask stevyhacker/tap/lokalbot",
      note: "Then enable Settings -> External Agents -> Meetings in LokalBot.",
    };
  }
  if (platform === "win32") {
    return {
      title: "Install on Windows (Scoop)",
      command:
        "scoop bucket add lokalbot https://github.com/stevyhacker/scoop-bucket; scoop install lokalbot/lokalbot",
      note: "Or download the Windows installer from lokalbot.com, then enable Settings -> AI agents -> Meetings.",
    };
  }
  return {
    title: "Install on Linux",
    command: "https://github.com/stevyhacker/LokalBot/releases/latest",
    note: "Install the .deb, .rpm, Arch package, or tarball, then enable Settings -> AI agents -> Meetings.",
  };
}

export class LokalBotCliClient {
  private readonly getConfiguredPath: () => string;
  private cachedPath: string | null = null;
  private cachedConfig = "";

  constructor(getConfiguredPath: () => string) {
    this.getConfiguredPath = getConfiguredPath;
  }

  resetCache(): void {
    this.cachedPath = null;
    this.cachedConfig = "";
  }

  async resolveCli(): Promise<string> {
    const configured = this.getConfiguredPath().trim();
    if (this.cachedPath && this.cachedConfig === configured) {
      return this.cachedPath;
    }
    const candidates = candidateCliPaths(configured);
    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate, ["--version"], { timeout: 5_000 });
        this.cachedPath = candidate;
        this.cachedConfig = configured;
        return candidate;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "EACCES") {
          continue;
        }
        this.cachedPath = candidate;
        this.cachedConfig = configured;
        return candidate;
      }
    }
    throw new CliMissingError();
  }

  async getVersion(): Promise<{ path: string; version: string }> {
    const cli = await this.resolveCli();
    const { stdout } = await execFileAsync(cli, ["--version"], { timeout: 5_000 });
    return { path: cli, version: stdout.trim() };
  }

  private async runJson<T>(args: string[], timeoutMs = 30_000): Promise<T> {
    const cli = await this.resolveCli();
    try {
      const { stdout } = await execFileAsync(cli, args, {
        maxBuffer: 32 * 1024 * 1024,
        timeout: timeoutMs,
      });
      return JSON.parse(stdout) as T;
    } catch (err) {
      const execErr = err as NodeJS.ErrnoException & {
        stderr?: string;
        stdout?: string;
      };
      if (execErr.code === "ENOENT") {
        this.resetCache();
        throw new CliMissingError();
      }
      throw classifyCliError(execErr.stderr ?? "", execErr.message ?? "");
    }
  }

  private async runText(args: string[], timeoutMs = 30_000): Promise<string> {
    const cli = await this.resolveCli();
    try {
      const { stdout } = await execFileAsync(cli, args, {
        maxBuffer: 32 * 1024 * 1024,
        timeout: timeoutMs,
      });
      return stdout;
    } catch (err) {
      const execErr = err as NodeJS.ErrnoException & { stderr?: string };
      if (execErr.code === "ENOENT") {
        this.resetCache();
        throw new CliMissingError();
      }
      throw classifyCliError(execErr.stderr ?? "", execErr.message ?? "");
    }
  }

  async listMeetings(limit = 25, query?: string): Promise<MeetingListEntry[]> {
    const args = ["list", "--limit", String(Math.max(1, Math.min(200, limit)))];
    if (query?.trim()) {
      args.push("--query", query.trim());
    }
    return this.runJson<MeetingListEntry[]>(args);
  }

  async getMeeting(
    id: string,
    includeTranscript = true,
  ): Promise<MeetingDetail> {
    const include = includeTranscript
      ? "metadata,summary,transcript"
      : "metadata,summary";
    return this.runJson<MeetingDetail>([
      "get",
      id,
      "--include",
      include,
      "--format",
      "json",
    ]);
  }

  async searchMeetings(query: string, limit = 30): Promise<SearchHit[]> {
    return this.runJson<SearchHit[]>([
      "search",
      query,
      "--limit",
      String(Math.max(1, Math.min(50, limit))),
    ]);
  }

  async listActions(options: {
    days?: number;
    meetingId?: string;
    owner?: string;
    status?: string;
    limit?: number;
  } = {}): Promise<ActionEntry[]> {
    const args = ["actions"];
    if (options.status) {
      args.push("--status", options.status);
    }
    if (options.owner) {
      args.push("--owner", options.owner);
    }
    if (options.meetingId) {
      args.push("--meeting", options.meetingId);
    } else if (options.days) {
      args.push("--days", String(Math.max(1, Math.min(365, options.days))));
    }
    if (options.limit) {
      args.push("--limit", String(Math.max(1, Math.min(200, options.limit))));
    }
    return this.runJson<ActionEntry[]>(args);
  }

  async getBriefing(): Promise<string> {
    return this.runText(["brief"]);
  }

  async askLibrary(question: string): Promise<AskOutcome> {
    const cli = await this.resolveCli();
    return new Promise((resolve, reject) => {
      const child = spawn(cli, ["ask", question]);
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") {
          this.resetCache();
          reject(new CliMissingError());
        } else {
          reject(err);
        }
      });
      child.on("close", () => {
        try {
          const parsed = JSON.parse(stdout) as AskOutcome;
          if (parsed.status === "error" && parsed.code === "access_disabled") {
            reject(new AccessDisabledError(parsed.text));
            return;
          }
          if (parsed.status === "error" && parsed.code === "app_not_running") {
            reject(new AppNotRunningError(parsed.text));
            return;
          }
          resolve(parsed);
        } catch {
          reject(classifyCliError(stderr, "lokalbot-cli ask returned no answer."));
        }
      });
      child.stdin.end();
    });
  }
}
