// Deterministic "required surface" catalogue. A surface is a concrete,
// verifiable thing the user asked for (a Main Menu, a Shop UI, a Dash
// ability, etc.). Extraction is regex-based so it never depends on a model
// getting the right answer.
//
// Shared by:
//   - smart-brain.functions.ts (planning + coverage gate)
//   - action-critic.server.ts   (post-build coverage check + auto-repair)

export type RequiredSurface = {
  id: string;
  label: string;
  planKeywords: string[]; // ALL must appear in plan text (lowercased)
  buildHint: string;
  // Deterministic action-side coverage rule. Given the emitted action
  // batch, return true when this surface appears to be built. Kept
  // permissive on purpose — false positives from the critic waste one
  // repair call, false negatives silently drop the surface.
  actionCovered: (actions: CoverageAction[]) => boolean;
};

export type CoverageAction = {
  kind: string;
  parent_path?: string;
  name?: string;
  payload?: Record<string, unknown>;
  source?: string;
};

function actionText(a: CoverageAction): string {
  const src = (a.source ?? (a.payload?.source as string | undefined) ?? "") + "";
  return [a.name ?? "", a.parent_path ?? "", src].join("\n").toLowerCase();
}

function anyActionMatches(actions: CoverageAction[], re: RegExp): boolean {
  return actions.some((a) => re.test(actionText(a)));
}

export const SURFACE_CATALOG: Array<Omit<RequiredSurface, "actionCovered"> & {
  match: RegExp;
  actionCovered: RequiredSurface["actionCovered"];
}> = [
  {
    id: "main_menu",
    label: "Main Menu",
    match: /\b(main\s*menu|title\s*screen|start\s*screen|menu\s*system|home\s*screen)\b/i,
    planKeywords: ["mainmenu"],
    buildHint:
      "MainMenu Frame inside BloxSmith_Game_UI ScreenGui with Play, Shop, Inventory, Settings TextButtons; each button MUST wire a MouseButton1Click handler that toggles the correct panel or fires the correct RemoteEvent.",
    actionCovered: (actions) => anyActionMatches(actions, /mainmenu|main[_\s-]menu|title[_\s-]?screen/i),
  },
  {
    id: "loading_screen",
    label: "Loading Screen",
    match: /\b(loading\s*screen|splash\s*screen|intro\s*screen|boot\s*screen)\b/i,
    planKeywords: ["loadingscreen"],
    buildHint:
      "LoadingScreen Frame inside BloxSmith_Game_UI covering the full viewport, with logo/title Label, progress Bar (Frame + Size tween), and a fade-out tween that transitions to MainMenu when ContentProvider:PreloadAsync finishes.",
    actionCovered: (actions) => anyActionMatches(actions, /loadingscreen|loading[_\s-]?screen|splash[_\s-]?screen/i),
  },
  {
    id: "hud",
    label: "In-game HUD",
    match: /\b(hud|heads?[-\s]?up\s*display|in[-\s]?game\s*ui|player\s*ui|game\s*ui)\b/i,
    planKeywords: ["hud"],
    buildHint:
      "HUD Frame inside BloxSmith_Game_UI shown only during active play; include Coins/Score label bound to leaderstats and an inventory hotkey hint.",
    actionCovered: (actions) => anyActionMatches(actions, /\bhud\b|heads[_\s-]?up/i),
  },
  {
    id: "shop_ui",
    label: "Shop UI",
    match: /\b(shop\s*(ui|gui|menu|panel|screen)?|store\s*(ui|gui|menu|panel|screen))\b/i,
    planKeywords: ["shop"],
    buildHint:
      "Shop panel Frame with a ScrollingFrame of item cards (Icon, Name, Price, Buy button); Buy fires a Purchase RemoteEvent validated server-side against a Config ModuleScript.",
    actionCovered: (actions) => anyActionMatches(actions, /\bshop\b|\bstore\b|purchase/i),
  },
  {
    id: "inventory_ui",
    label: "Inventory UI",
    match: /\b(inventory\s*(ui|gui|menu|panel|screen)?|backpack\s*ui|bag\s*ui)\b/i,
    planKeywords: ["inventory"],
    buildHint:
      "Inventory panel Frame with a UIGridLayout of slot Frames; slots read from a per-player Inventory ModuleScript / Attribute and update via a RemoteEvent.",
    actionCovered: (actions) => anyActionMatches(actions, /inventory|backpack/i),
  },
  {
    id: "settings_menu",
    label: "Settings Menu",
    match: /\b(settings?\s*(menu|panel|screen|ui|gui)?|options\s*menu)\b/i,
    planKeywords: ["settings"],
    buildHint:
      "Settings panel Frame with Music volume slider, SFX volume slider, and Graphics quality dropdown; persist via a DataStore-backed player Attribute.",
    actionCovered: (actions) => anyActionMatches(actions, /settings|options[_\s-]?menu/i),
  },
  {
    id: "pause_menu",
    label: "Pause Menu",
    match: /\b(pause\s*(menu|screen|ui|gui))\b/i,
    planKeywords: ["pause"],
    buildHint:
      "Pause panel Frame toggled by ContextActionService binding Escape/Options; freezes local time-scale UI and offers Resume, Settings, Quit buttons.",
    actionCovered: (actions) => anyActionMatches(actions, /pause/i),
  },
  {
    id: "leaderboard_ui",
    label: "Leaderboard UI",
    match: /\b(leaderboard\s*(ui|gui|panel|screen)?|scoreboard)\b/i,
    planKeywords: ["leaderboard"],
    buildHint:
      "Leaderboard ScrollingFrame that mirrors leaderstats for all Players, ordered descending by primary stat.",
    actionCovered: (actions) => anyActionMatches(actions, /leaderboard|scoreboard|leaderstats/i),
  },
  {
    id: "dash_ability",
    label: "Dash ability",
    match: /\b(dash(ing)?|air\s*dash|dodge\s*roll)\b/i,
    planKeywords: ["dash"],
    buildHint:
      "LocalScript in StarterPlayerScripts using ContextActionService to bind Q; applies a horizontal-only LinearVelocity (MaxAxesForce Vector3.new(1e6,0,1e6)) for 0.22s with 1.1s cooldown; disables FallingDown/Ragdoll states during the window and restores them; NEVER uses BodyVelocity and NEVER kills the player.",
    actionCovered: (actions) => anyActionMatches(actions, /\bdash\b|dodge[_\s-]?roll/i),
  },
  {
    id: "sprint_ability",
    label: "Sprint",
    match: /\b(sprint(ing)?|run\s*button|shift\s*to\s*run)\b/i,
    planKeywords: ["sprint"],
    buildHint:
      "LocalScript bound to LeftShift; multiplies Humanoid.WalkSpeed by a Config factor while held and restores baseline on release.",
    actionCovered: (actions) => anyActionMatches(actions, /sprint|walkspeed/i),
  },
  {
    id: "double_jump",
    label: "Double Jump",
    match: /\b(double\s*jump|multi\s*jump|air\s*jump)\b/i,
    planKeywords: ["doublejump"],
    buildHint:
      "LocalScript tracking Humanoid.StateChanged; allows one extra Jump impulse (Humanoid:ChangeState) while airborne, reset on Landed.",
    actionCovered: (actions) => anyActionMatches(actions, /double[_\s-]?jump|multi[_\s-]?jump|air[_\s-]?jump/i),
  },
];

export function extractRequiredSurfaces(goal: string): RequiredSurface[] {
  const found: RequiredSurface[] = [];
  for (const s of SURFACE_CATALOG) {
    if (s.match.test(goal)) {
      found.push({
        id: s.id,
        label: s.label,
        planKeywords: s.planKeywords,
        buildHint: s.buildHint,
        actionCovered: s.actionCovered,
      });
    }
  }
  return found;
}

export function checkPlanCoverage(
  plan: string,
  required: RequiredSurface[],
): { covered: string[]; missing: string[] } {
  const lower = plan.toLowerCase();
  const covered: string[] = [];
  const missing: string[] = [];
  for (const s of required) {
    const ok = s.planKeywords.every((k) => lower.includes(k.toLowerCase()));
    if (ok) covered.push(s.label);
    else missing.push(s.label);
  }
  return { covered, missing };
}

export function checkActionCoverage(
  actions: CoverageAction[],
  required: RequiredSurface[],
): { covered: RequiredSurface[]; missing: RequiredSurface[] } {
  const covered: RequiredSurface[] = [];
  const missing: RequiredSurface[] = [];
  for (const s of required) {
    if (s.actionCovered(actions)) covered.push(s);
    else missing.push(s);
  }
  return { covered, missing };
}
