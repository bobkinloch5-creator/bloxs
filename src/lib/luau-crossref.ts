// Cross-script reference validator. Given the set of prepared plugin actions
// for one build turn, scan every generated Luau script for references to
// named children that other scripts assume will exist at runtime, then
// confirm a matching create action was emitted. When a script references
// `ReplicatedStorage.Remotes.MyRemote` but no `remoteevent` action created
// "MyRemote", we auto-inject the missing create action so the runtime call
// doesn't error with "attempt to index nil".
//
// Only handles the most common runtime failure classes:
//   - RemoteEvent / RemoteFunction under ReplicatedStorage
//   - ModuleScript referenced by absolute path under ReplicatedStorage
//   - Folder in ReplicatedStorage (e.g. "Remotes")
//
// Deliberately skips `script.Parent.X` and `script.Parent.Parent.X` — those
// are relative and depend on placement we can't infer statically.

import { stripCodeFences } from "@/lib/luau-validator";

export type CrossRefAction = {
  kind?: string;
  name?: string;
  parent_path?: string;
  payload?: Record<string, unknown>;
};

export type MissingRef = {
  name: string;
  kind: "remoteevent" | "remotefunction" | "modulescript" | "folder";
  parent_path: string;
  referencedBy: string;
};

const NAME_RE = "[A-Za-z_][A-Za-z0-9_]*";
const STR_NAME_RE = `["']([A-Za-z_][A-Za-z0-9_]*)["']`;

// Matches `:WaitForChild("Foo")`, `:FindFirstChild("Foo")`, `.Foo` chained after
// a known service.
function extractRefs(source: string): Array<{ container: string; name: string }> {
  const refs: Array<{ container: string; name: string }> = [];
  const containers = ["ReplicatedStorage", "ServerStorage", "ServerScriptService"];

  for (const container of containers) {
    // getService("ReplicatedStorage") aliased or direct access:
    // Pattern 1: game:GetService("ReplicatedStorage"):WaitForChild("Remotes"):WaitForChild("Fire")
    // Pattern 2: ReplicatedStorage.Remotes.Fire
    // Pattern 3: ReplicatedStorage:FindFirstChild("Remotes")

    // Chained WaitForChild / FindFirstChild strings anchored to the service.
    const chainRe = new RegExp(
      `${container}\\s*(?::WaitForChild\\(\\s*${STR_NAME_RE}\\s*(?:,\\s*\\d+\\s*)?\\)|:FindFirstChild\\(\\s*${STR_NAME_RE}\\s*\\)|\\.${NAME_RE})`,
      "g",
    );
    // We can't easily model multi-hop chains with a single regex, so we do a
    // simpler two-pass approach below.

    // Two-pass: find substrings starting at the service name up to the end of
    // the statement, then walk `.Name` and `:WaitForChild("Name")` tokens.
    const anchorRe = new RegExp(`\\b${container}\\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(source))) {
      const start = m.index + container.length;
      // Grab up to 400 chars of chain (enough for realistic paths).
      const tail = source.slice(start, start + 400);
      const chain: string[] = [];
      const chainTokenRe = new RegExp(
        `^\\s*(?::WaitForChild\\(\\s*${STR_NAME_RE}\\s*(?:,\\s*\\d+\\s*)?\\)|:FindFirstChild\\(\\s*${STR_NAME_RE}\\s*\\)|\\.(${NAME_RE}))`,
      );
      let cursor = 0;
      while (cursor < tail.length) {
        const sub = tail.slice(cursor);
        const tok = chainTokenRe.exec(sub);
        if (!tok) break;
        const name = tok[1] ?? tok[2] ?? tok[3];
        if (!name || name === "Parent" || name === "Name" || name === "ClassName") break;
        chain.push(name);
        cursor += tok[0].length;
        if (chain.length >= 4) break; // Container.Folder.Sub.Leaf max
      }

      // Emit each hop as a ref: (parent_path, name).
      let parent = container === "ReplicatedStorage" ? "ReplicatedStorage" :
                    container === "ServerStorage" ? "ServerStorage" : "ServerScriptService";
      for (const seg of chain) {
        refs.push({ container: parent, name: seg });
        parent = `${parent}.${seg}`;
      }
    }
    void chainRe;
  }

  return refs;
}

// Guess the kind of a referenced instance from how the calling script uses it.
// If the script calls :FireServer / :FireAllClients / :Fire on the ref, it's a
// RemoteEvent. If :InvokeServer / :InvokeClient, RemoteFunction. If require()
// wraps it, ModuleScript. Otherwise Folder.
function guessKind(source: string, refName: string): MissingRef["kind"] {
  const refRe = new RegExp(
    `(?:WaitForChild\\(\\s*["']${refName}["']|FindFirstChild\\(\\s*["']${refName}["']|\\.${refName})\\s*\\)?\\s*(?::([A-Za-z]+)|=)`,
    "g",
  );
  let m: RegExpExecArray | null;
  const methods: string[] = [];
  while ((m = refRe.exec(source))) {
    if (m[1]) methods.push(m[1]);
    if (methods.length > 4) break;
  }
  // Also look at how the ref is used across the file.
  const usageRe = new RegExp(`\\b${refName}\\b\\s*:([A-Za-z]+)\\s*\\(`, "g");
  while ((m = usageRe.exec(source))) methods.push(m[1]);

  if (methods.some((mm) => /^(FireServer|FireAllClients|FireClient|Fire)$/.test(mm))) return "remoteevent";
  if (methods.some((mm) => /^(InvokeServer|InvokeClient|Invoke)$/.test(mm))) return "remotefunction";
  if (new RegExp(`require\\s*\\(\\s*[^)]*\\b${refName}\\b`).test(source)) return "modulescript";
  return "folder";
}

// Collect the set of (parent_path, name) pairs produced by explicit create actions.
function collectDefinedInstances(actions: CrossRefAction[]): Set<string> {
  const defined = new Set<string>();
  for (const a of actions) {
    const kind = String(a.kind ?? "");
    if (!kind) continue;
    // Skip actions that don't create a named child.
    const createKinds = new Set([
      "remoteevent", "remotefunction", "modulescript", "screengui",
      "script", "localscript", "part", "folder", "sound", "instance",
    ]);
    if (!createKinds.has(kind)) continue;
    const parent = String(a.parent_path ?? "").trim();
    const name = String(a.name ?? "").trim();
    if (!parent || !name) continue;
    // Normalise leading "game." out.
    const normParent = parent.replace(/^game\./, "");
    defined.add(`${normParent}::${name}`);
  }
  // Also implicit: standard service roots always exist.
  for (const svc of ["ReplicatedStorage", "ServerStorage", "ServerScriptService", "Workspace", "StarterGui", "StarterPack"]) {
    defined.add(`game::${svc}`);
  }
  return defined;
}

export function findMissingCrossRefs(actions: CrossRefAction[]): MissingRef[] {
  const defined = collectDefinedInstances(actions);
  const missing = new Map<string, MissingRef>();

  const scriptKinds = new Set(["script", "localscript", "modulescript", "run_lua"]);

  for (const action of actions) {
    if (!scriptKinds.has(String(action.kind ?? ""))) continue;
    const source = stripCodeFences(String(action.payload?.source ?? ""));
    if (!source || source.length < 20) continue;

    const refs = extractRefs(source);
    for (const ref of refs) {
      const key = `${ref.container}::${ref.name}`;
      if (defined.has(key)) continue;
      // Skip refs that themselves look like a service alias.
      if (/^(GetService|Instance)$/.test(ref.name)) continue;
      if (missing.has(key)) continue;

      // Container path is what we already computed; strip any leading game.
      const parent_path = ref.container.replace(/^game\./, "");

      // Only auto-create leaf hops. If the ref lives one deeper than a known
      // service (e.g. ReplicatedStorage.Remotes), we can safely emit a folder.
      // If it's the leaf under a folder we're already creating, guess kind
      // from usage.
      const kind = guessKind(source, ref.name);
      missing.set(key, {
        name: ref.name,
        kind,
        parent_path,
        referencedBy: String(action.name ?? action.kind ?? "unknown"),
      });
      // Ensure future hops treat this as defined so we don't cascade.
      defined.add(key);
    }
  }
  return Array.from(missing.values());
}

// Build synthesised create-actions for missing refs. Slots them BEFORE the
// scripts that reference them so Roblox executes creates first.
export function synthesiseMissingCreateActions(missing: MissingRef[]): CrossRefAction[] {
  return missing.map((m) => ({
    kind: m.kind,
    name: m.name,
    parent_path: m.parent_path,
    payload: m.kind === "modulescript"
      ? { source: `-- Auto-created ModuleScript for cross-ref "${m.name}" (referenced by ${m.referencedBy})\nlocal ${m.name} = {}\n\nreturn ${m.name}\n` }
      : {},
  }));
}
