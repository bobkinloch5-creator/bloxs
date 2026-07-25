// BloxSmith Studio Export
// ---------------------------------------------------------------------------
// Produces a complete, ready to open Roblox Studio project:
//   * default.project.json (Rojo 7 format)
//   * src/ tree with every script in the right service
//   * BloxSmith_Install.lua one-shot builder for people who do not use Rojo
//   * README with next steps

import { EXPLORER_SCAFFOLD, ROBLOX_SERVICES } from "./roblox-explorer";

export type ExportScript = {
  className: "Script" | "LocalScript" | "ModuleScript";
  name: string;
  parentPath: string;
  source: string;
};

export type ExportFile = { path: string; content: string };

export type StudioExport = {
  files: ExportFile[];
  projectName: string;
  scriptCount: number;
};

const EXTENSION: Record<ExportScript["className"], string> = {
  Script: ".server.lua",
  LocalScript: ".client.lua",
  ModuleScript: ".lua",
};

function slug(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "bloxsmith-game";
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_ ]/g, "").trim() || "Item";
}

type TreeNode = { $className?: string; $path?: string } & Record<string, unknown>;

/** Build the Rojo project tree from the script list plus the standard scaffold. */
function buildRojoTree(scripts: ExportScript[]): Record<string, unknown> {
  const tree: Record<string, TreeNode> = {};

  for (const service of ROBLOX_SERVICES) {
    tree[service] = { $className: service };
  }

  const ensure = (path: string): TreeNode => {
    const segments = path.split(".").map(safeSegment).filter(Boolean);
    const serviceName = segments.shift() ?? "ServerScriptService";
    let node: TreeNode = tree[serviceName] ?? (tree[serviceName] = { $className: serviceName });
    for (const segment of segments) {
      const existing = node[segment] as TreeNode | undefined;
      if (existing && typeof existing === "object") {
        node = existing;
      } else {
        const created: TreeNode = { $className: "Folder" };
        node[segment] = created;
        node = created;
      }
    }
    return node;
  };

  for (const entry of EXPLORER_SCAFFOLD) ensure(entry.path);

  for (const script of scripts) {
    const parent = ensure(script.parentPath);
    const fileName = safeSegment(script.name) + EXTENSION[script.className];
    const folderPath = script.parentPath.split(".").map(safeSegment).join("/");
    parent[safeSegment(script.name)] = { $path: `src/${folderPath}/${fileName}` };
  }

  return tree;
}

function buildInstallerLua(scripts: ExportScript[], projectName: string): string {
  const header = [
    "--[[",
    `\t${projectName} - BloxSmith one-shot installer`,
    "",
    "\tNo Rojo required. Paste this into the Studio Command Bar (or run it from",
    "\ta Script once) and the whole project is created in the correct services.",
    "]]",
    "",
    "local function ensurePath(path)",
    '\tlocal segments = {}',
    '\tfor segment in path:gmatch("[^%.]+") do',
    "\t\ttable.insert(segments, segment)",
    "\tend",
    "\tlocal current = game:GetService(table.remove(segments, 1))",
    "\tfor _, segment in ipairs(segments) do",
    "\t\tlocal child = current:FindFirstChild(segment)",
    "\t\tif not child then",
    '\t\t\tchild = Instance.new("Folder")',
    "\t\t\tchild.Name = segment",
    "\t\t\tchild.Parent = current",
    "\t\tend",
    "\t\tcurrent = child",
    "\tend",
    "\treturn current",
    "end",
    "",
    "local function writeScript(className, name, path, source)",
    "\tlocal parent = ensurePath(path)",
    "\tlocal existing = parent:FindFirstChild(name)",
    "\tif existing then",
    "\t\texisting:Destroy()",
    "\tend",
    "\tlocal instance = Instance.new(className)",
    "\tinstance.Name = name",
    "\tinstance.Source = source",
    "\tinstance.Parent = parent",
    "\treturn instance",
    "end",
    "",
  ];

  const scaffold = EXPLORER_SCAFFOLD.map((entry) => `ensurePath("${entry.path}")`);

  const bodies = scripts.map((script) => {
    const name = safeSegment(script.name);
    const path = script.parentPath.replace(/"/g, '\\"');
    return [
      `writeScript("${script.className}", "${name}", "${path}", [==[`,
      script.source,
      "]==])",
      "",
    ].join("\n");
  });

  return [
    ...header,
    "-- Explorer scaffold ------------------------------------------------------",
    ...scaffold,
    "",
    "-- Scripts -----------------------------------------------------------------",
    ...bodies,
    `print("[BloxSmith] Installed ${scripts.length} script(s) for ${projectName}")`,
    "",
  ].join("\n");
}

function buildReadme(projectName: string, scripts: ExportScript[]): string {
  const byClass = scripts.reduce<Record<string, number>>((acc, script) => {
    acc[script.className] = (acc[script.className] ?? 0) + 1;
    return acc;
  }, {});

  return [
    `# ${projectName}`,
    "",
    "Generated by BloxSmith. Everything here is a real Roblox project layout.",
    "",
    "## What is inside",
    "",
    `- ${scripts.length} scripts (${Object.entries(byClass)
      .map(([className, count]) => `${count} ${className}`)
      .join(", ")})`,
    "- `default.project.json` - Rojo 7 project file",
    "- `src/` - one file per script, mirroring the Explorer hierarchy",
    "- `BloxSmith_Install.lua` - paste-and-run installer if you do not use Rojo",
    "",
    "## Option A: open with Rojo",
    "",
    "```bash",
    "rojo serve",
    "```",
    "",
    "Then connect from the Rojo Studio plugin and click Sync In.",
    "",
    "## Option B: no tooling",
    "",
    "1. Open Roblox Studio and create a new baseplate.",
    "2. Open View -> Command Bar.",
    "3. Paste the contents of `BloxSmith_Install.lua` and press Enter.",
    "",
    "Every folder and script is created in the correct service automatically.",
    "",
    "## Publishing checklist",
    "",
    "- Replace placeholder asset ids with your own uploads.",
    "- Set your Developer Product and Gamepass ids in `Monetization`.",
    "- Enable Studio Access to API Services so DataStores work in Studio.",
    "- Playtest with two players (Test -> Players -> 2) before publishing.",
    "",
  ].join("\n");
}

/** Build every file for a downloadable Studio project. */
export function buildStudioExport(
  projectName: string,
  scripts: ExportScript[],
  extras: { assetIds?: Array<{ label: string; assetId: string }>; notes?: string[] } = {},
): StudioExport {
  const name = projectName.trim() || "BloxSmith Game";
  const files: ExportFile[] = [];

  files.push({
    path: "default.project.json",
    content:
      JSON.stringify(
        {
          name: slug(name),
          tree: { $className: "DataModel", ...buildRojoTree(scripts) },
        },
        null,
        2,
      ) + "\n",
  });

  for (const script of scripts) {
    const folderPath = script.parentPath.split(".").map(safeSegment).join("/");
    files.push({
      path: `src/${folderPath}/${safeSegment(script.name)}${EXTENSION[script.className]}`,
      content: script.source.endsWith("\n") ? script.source : script.source + "\n",
    });
  }

  files.push({ path: "BloxSmith_Install.lua", content: buildInstallerLua(scripts, name) });
  files.push({ path: "README.md", content: buildReadme(name, scripts) });

  files.push({
    path: "bloxsmith.manifest.json",
    content:
      JSON.stringify(
        {
          generator: "BloxSmith",
          project: name,
          generatedAt: new Date().toISOString(),
          scripts: scripts.map((script) => ({
            name: script.name,
            className: script.className,
            parentPath: script.parentPath,
            lines: script.source.split("\n").length,
          })),
          assets: extras.assetIds ?? [],
          notes: extras.notes ?? [],
        },
        null,
        2,
      ) + "\n",
  });

  return { files, projectName: name, scriptCount: scripts.length };
}

/** Minimal, dependency-free ZIP writer (stored entries, no compression). */
export function zipFiles(files: ExportFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (data: Uint8Array): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i += 1) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };

  const u16 = (value: number) => new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
  const u32 = (value: number) =>
    new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
  const concat = (parts: Uint8Array[]) => {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const part of parts) {
      out.set(part, cursor);
      cursor += part.length;
    }
    return out;
  };

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const data = encoder.encode(file.content);
    const crc = crc32(data);

    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);

    chunks.push(localHeader, data);

    central.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );

    offset += localHeader.length + data.length;
  }

  const centralBytes = concat(central);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBytes.length),
    u32(offset),
    u16(0),
  ]);

  return concat([...chunks, centralBytes, end]);
}
