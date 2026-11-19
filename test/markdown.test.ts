import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMeetingFileName,
  escapeYamlString,
  extractDatePrefix,
  formatActionChecklist,
  formatAskCallout,
  formatDuration,
  renderMeetingNote,
  sanitizeFileName,
} from "../src/markdown.ts";

test("extractDatePrefix and formatDuration handle normal and edge inputs", () => {
  assert.equal(extractDatePrefix("2026-11-19T10:30:00Z"), "2026-11-19");
  assert.equal(extractDatePrefix("invalid"), "undated");
  assert.equal(formatDuration(0), "0m");
  assert.equal(formatDuration(20), "<1m");
  assert.equal(formatDuration(1560), "26m");
  assert.equal(formatDuration(3600), "1h");
  assert.equal(formatDuration(5460), "1h 31m");
});

test("sanitizeFileName strips forbidden cross-platform filename characters", () => {
  assert.equal(
    sanitizeFileName('Q4 / Launch: "Pricing" <v2>? #draft...'),
    "Q4 Launch Pricing v2 draft",
  );
  assert.equal(sanitizeFileName("   "), "Untitled meeting");
  assert.equal(
    buildMeetingFileName({
      id: "abcd1234",
      date: "2026-11-19T09:00:00Z",
      title: "Design Review: Sync/Auth",
    }),
    "2026-11-19 Design Review Sync Auth.md",
  );
});

test("escapeYamlString escapes quotes, backslashes, and newlines", () => {
  assert.equal(
    escapeYamlString('Say "hello" \\ line 1\nline 2'),
    '"Say \\"hello\\" \\\\ line 1 line 2"',
  );
});

test("renderMeetingNote writes frontmatter, actions, summary, and collapsed transcript", () => {
  const note = renderMeetingNote(
    {
      id: "4f7c2a91",
      uuid: "4f7c2a91-0000-4000-8000-000000000001",
      title: "Harbor Launch Sync",
      date: "2026-11-19T10:00:00Z",
      duration_seconds: 1800,
      app_source: "Zoom",
      has_system_track: true,
      summary: "Agreed to ship Harbor beta on Thursday.",
      transcript: "**Me (00:01):** Let's ship Thursday.\n\n**Maya (00:05):** Sounds good.",
    },
    {
      includeTranscript: true,
      collapseTranscript: true,
      actions: [
        {
          text: "Send beta notes to Maya",
          owner: "Me",
          for_user: true,
          due_date: "2026-11-20",
          overdue: false,
          status: "open",
          mention_count: 1,
          meetings: [{ id: "4f7c2a91", title: "Harbor Launch Sync", date: "2026-11-19T10:00:00Z" }],
        },
      ],
    },
  );

  assert.match(note, /^---\n/);
  assert.match(note, /lokalbot_id: "4f7c2a91"/);
  assert.match(note, /lokalbot_uuid: "4f7c2a91-0000-4000-8000-000000000001"/);
  assert.match(note, /- \[ \] Send beta notes to Maya — _Me \(me\) · due 2026-11-20_/);
  assert.match(note, /## Summary\n\nAgreed to ship Harbor beta on Thursday\./);
  assert.match(note, /> \[!note\]- Transcript\n> \*\*Me \(00:01\):\*\*/);
});

test("formatActionChecklist and formatAskCallout render clean Obsidian Markdown", () => {
  assert.equal(formatActionChecklist([]), "_No open action items._");

  const callout = formatAskCallout("When does Harbor ship?", {
    status: "answered",
    text: "Thursday morning after the accessibility review.",
    sources: [
      {
        meeting_id: "4f7c2a91",
        title: "Harbor Launch Sync",
        date: "2026-11-19T10:00:00Z",
      },
    ],
  });
  assert.match(callout, /^> \[!quote\] LokalBot: When does Harbor ship\?/);
  assert.match(callout, /> - Harbor Launch Sync \(2026-11-19, `4f7c2a91`\)/);
});
