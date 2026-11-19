import assert from "node:assert/strict";
import test from "node:test";
import {
  AccessDisabledError,
  AppNotRunningError,
  candidateCliPaths,
  classifyCliError,
  installHintForPlatform,
} from "../src/cli.ts";

test("candidateCliPaths orders custom path first and covers macOS, Windows, and Linux", () => {
  const mac = candidateCliPaths("/custom/lokalbot-cli", {
    platform: "darwin",
    homeDir: "/Users/alice",
  });
  assert.equal(mac[0], "/custom/lokalbot-cli");
  assert.equal(mac[1], "lokalbot-cli");
  assert.ok(mac.includes("/Applications/LokalBot.app/Contents/Helpers/lokalbot-cli"));
  assert.ok(mac.includes("/Users/alice/.local/bin/lokalbot-cli"));

  const win = candidateCliPaths("", {
    platform: "win32",
    homeDir: "C:\\Users\\alice",
    localAppData: "C:\\Users\\alice\\AppData\\Local",
    userProfile: "C:\\Users\\alice",
  });
  assert.equal(win[0], "lokalbot-cli.exe");
  assert.ok(win.includes("C:\\Users\\alice\\AppData\\Local\\Programs\\LokalBot\\bin\\lokalbot-cli.exe"));
  assert.ok(win.includes("C:\\Users\\alice\\scoop\\shims\\lokalbot-cli.exe"));

  const linux = candidateCliPaths("", {
    platform: "linux",
    homeDir: "/home/alice",
  });
  assert.ok(linux.includes("/home/alice/.local/bin/lokalbot-cli"));
  assert.ok(linux.includes("/usr/bin/lokalbot-cli"));
});

test("classifyCliError detects access_disabled and app_not_running codes", () => {
  assert.ok(
    classifyCliError("[access_disabled] Turn on meetings access", "") instanceof
      AccessDisabledError,
  );
  assert.ok(
    classifyCliError("[app_not_running] Open LokalBot", "") instanceof
      AppNotRunningError,
  );
});

test("installHintForPlatform returns tailored hints per OS", () => {
  assert.match(installHintForPlatform("darwin").command, /brew install/);
  assert.match(installHintForPlatform("win32").command, /scoop/);
  assert.match(installHintForPlatform("linux").command, /releases\/latest/);
});
