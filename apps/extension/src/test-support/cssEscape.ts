// jsdom ships no `CSS` object, and the engine escapes job ids with CSS.escape before
// querying for a job's bars. Render keys are a prefix plus a platform id, with nothing
// CSS-special in them, so identity is a faithful stand-in for tests that reach a
// render path.
export function installCssEscape() {
  (globalThis as { CSS?: { escape: (s: string) => string } }).CSS ??= { escape: (s) => s };
}
