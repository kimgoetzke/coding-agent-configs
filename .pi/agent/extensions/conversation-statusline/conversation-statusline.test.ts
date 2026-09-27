import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Replace Pi's editor at the module boundary; exercise the extension's public session/UI hooks.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@earendil-works/pi-coding-agent") {
      const stub = `export class CustomEditor {
        constructor() { this.borderColor = text => '<border>' + text + '</border>'; }
        render(width) {
          const line = '─'.repeat(width);
          return [this.borderColor(line), this.borderColor(line)];
        }
      }`;
      return { url: `data:text/javascript,${encodeURIComponent(stub)}`, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { default: extension } = await import("./conversation-statusline.ts");

test("the editor updates both borders when /name changes and restores defaults when cleared", () => {
  let name = "Session 0"; // Restored name when the editor is first rendered.
  let editorFactory;
  const handlers = new Map();
  extension({
    on(event, handler) { handlers.set(event, handler); },
    getSessionName() { return name; },
  });
  const theme = {
    fg(token, text) { return `<fg:${token}>${text}</fg>`; },
    getFgAnsi(token) {
      if (token === "syntaxNumber") return "\u001b[38;2;42;172;184m";
      if (token === "success") return "\u001b[38;2;106;171;115m";
      if (token === "userMessageText") return "\u001b[38;2;206;208;214m";
      if (token === "selectedBg") throw new Error("Unknown theme color: selectedBg");
    },
    getBgAnsi(token) {
      if (token === "selectedBg") return "\u001b[48;2;43;45;48m";
    },
  };
  handlers.get("session_start")({}, {
    hasUI: true,
    ui: { theme, setEditorComponent(factory) { editorFactory = factory; } },
  });
  const editor = editorFactory({}, {}, {});
  let lines = editor.render(28);
  assert.match(lines[0], /<fg:syntaxNumber>/);
  assert.match(lines[1], /<fg:syntaxNumber>/);

  name = "Session 1";
  lines = editor.render(28);
  assert.match(lines[0], /<fg:success>/);
  assert.match(lines[1], /<fg:success>/);

  name = undefined;
  assert.deepEqual(editor.render(28), ["<border>────────────────────────────</border>", "<border>────────────────────────────</border>"]);

  name = "Session 3";
  lines = editor.render(28);
  assert.match(lines[0], /<fg:accent>/);
  assert.match(lines[1], /<fg:accent>/);
});
