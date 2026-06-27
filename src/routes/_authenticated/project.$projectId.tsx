import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProject, listProjects } from "@/lib/projects.functions";
import { listMessages, listProjectActions, getPluginSession, clearMessages, clearActionQueue, undoLastBuild, queuePluginCommand, queueFixAll, queueTestInsert, queuePreparedStudioActions } from "@/lib/chat.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MODELS, DEFAULT_MODEL_ID } from "@/lib/models";
import ReactMarkdown from "react-markdown";
import {
  Send, Loader2, CheckCircle2, AlertCircle, Radio, Sparkles, MessageSquare,
  FileCode, Paperclip, Wrench, Wand2, HelpCircle, Save, Crown,
  Sun, Moon, ChevronDown, Zap, Timer, Box, X, Infinity as InfinityIcon,
  Folder, Lightbulb, LayoutDashboard, Search, Settings as SettingsIcon,
  Plug, History, Users, Bell, Plus, ExternalLink, RefreshCw, ImageIcon,
  Cpu, Music, BookOpen, Upload, RotateCcw, Square, Undo2,
  ShieldCheck, Bot, Hammer, Bug, PlayCircle, Gauge, ScanLine,
} from "lucide-react";
import bloxLogo from "@/assets/bloxsmith-logo.png.asset.json";
import { OnboardingTour } from "@/components/OnboardingTour";
import { MobileNavTrigger } from "@/components/MobileNav";

import { VoiceControls, useBloxSmithSpeaker } from "@/components/VoiceControls";
import { VoiceBuildButton } from "@/components/VoiceBuildButton";
import { improvePrompt } from "@/lib/improve.functions";
import { useLang, LANGUAGES } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/project/$projectId")({
  head: () => ({ meta: [{ title: "Build — BloxSmith" }] }),
  component: ProjectPage,
});

type Theme = "default" | "grey" | "light";

const QUICK_PROMPTS = [
  { label: "Zombie survival", icon: Sparkles, prompt: "Build a zombie survival map with waves, shop, guns, safe zone, health UI, leaderboard, DataStore saving, and a scan_project check at the end." },
  { label: "Tycoon", icon: Sparkles, prompt: "Build a complete tycoon with safe Toolbox assets, droppers, conveyors, upgrade pads, cash saving, shop UI, and organize_project." },
  { label: "Pet simulator", icon: Sparkles, prompt: "Build a pet simulator with safe Toolbox pets/eggs/map assets, egg hatching, pet inventory, followers, rebirths, coin shop, UI, and saving." },
  { label: "Racing game", icon: Sparkles, prompt: "Build a racing game with safe Toolbox track and vehicle assets, laps, checkpoints, timer UI, leaderboard, and mobile support." },
  { label: "RPG quest system", icon: Sparkles, prompt: "Add an NPC quest system with safe NPC assets, dialog UI, multiple quests, rewards, quest log GUI, DataStore progress, and server validation." },
  { label: "More ideas",           icon: Lightbulb, prompt: "Give me 5 unique Roblox game ideas I haven't seen before." },
];

const COMPOSER_ACTIONS = [
  { label: "Build in Studio", icon: Upload, mode: "build" as const, prompt: "Build the current request in Roblox Studio now using the full BloxSmith brain: plan the build order, use safe Toolbox assets for visuals, create complete scripts/UI/remotes/DataStores, organize services correctly, test with scan_project, and fix obvious issues." },
  { label: "Fix Errors", icon: Bug, mode: "build" as const, prompt: "Use the latest Studio errors, memory, and workspace scan to fix broken scripts, missing RemoteEvents, duplicated NPCs, floating assets, unwired UI buttons, DataStore problems, mobile issues, and performance problems. Explain the cause briefly, include autofix_project, then scan_project to verify." },
  { label: "Generate UI", icon: ImageIcon, mode: "build" as const, prompt: "AI Image-to-Roblox UI Generator: generate a premium Roblox UI concept image in chat, then convert it into real functional Roblox Studio UI. Build ScreenGui, Frames, TextButtons, ImageButtons/ImageLabels where useful, TextLabels, UIStroke, UICorner, UIGradient, UIPadding, UIListLayout/UIGridLayout, UIScale, UIAspectRatioConstraint, LocalScripts, TweenService animations, wired close/open/play/shop/settings/inventory buttons, mobile-safe scaling, and scan_project/autofix_project tests. Do not leave the UI as a flat image." },
  { label: "Add UI", icon: LayoutDashboard, mode: "build" as const, prompt: "Build premium Roblox UI for this project: loading screen, main menu, Play button, settings, shop, inventory, quest UI, health/currency HUD, notifications, mobile controls, smooth TweenService animations, responsive constraints, clean fonts/colors/spacing, click sounds, and fully wired buttons/remotes. No default grey UI, no placeholders, no overlapping text." },
  { label: "Add NPCs", icon: Bot, mode: "build" as const, prompt: "Add safe free Toolbox NPC/enemy assets that match this game, then wire Humanoids, AI behavior, spawn folders, remotes/modules if needed, and clean organization." },
  { label: "Toolbox Assets", icon: Box, mode: "build" as const, prompt: "Search Roblox Toolbox/Creator Store for safe free assets that match this project, insert real models with names/ids, place them cleanly, and organize them. Do not use placeholder geometry." },
  { label: "Scan Game", icon: ScanLine, command: "scan_project" as const },
  { label: "Fix All", icon: Wrench, command: "fix_all" as const },
  { label: "Playtest", icon: PlayCircle, mode: "build" as const, prompt: "Run a playtest-style audit using the latest scan/errors. Add scan_project, report problems found, and fix obvious breakages with safe actions." },
  { label: "Improve Map", icon: Hammer, mode: "build" as const, prompt: "Improve the existing map using safe free Toolbox assets only: better placement, lighting, spawn flow, signs, props, organization, and scan_project. Avoid procedural placeholder maps." },
  { label: "Make Premium", icon: Crown, mode: "build" as const, prompt: "Make this game feel premium and ready for release: professional loading screen, main menu, animated Play button, polished settings/shop/inventory/HUD/tutorial UI, mobile-safe layout, notification popups, smooth transitions, lighting, sky/atmosphere, camera effects, sounds, particles, cleanup, organize_project, and scan_project. No ugly default UI or unfinished screens." },
  { label: "Test Insert", icon: Plug, command: "test_insert" as const },
  { label: "Explain", icon: HelpCircle, mode: "chat" as const, prompt: "Explain what was just built and how the scripts, remotes, UI, assets, and DataStores work, step by step." },
];

const GAME_TEMPLATES = [
  { label: "Obby", prompt: "Build a complete obby template with safe Toolbox obby/parkour assets, checkpoints, kill parts, stage saving, leaderboard, HUD, and finish reward." },
  { label: "Tycoon", prompt: "Build a complete tycoon template with safe Toolbox tycoon/building assets, droppers, conveyors, collectors, upgrade pads, cash saving, shop UI, and rebirth-ready structure." },
  { label: "Simulator", prompt: "Build a simulator template with safe assets, collection tool, currency, rebirths, upgrade shop, daily rewards, codes, DataStore saving, and mobile HUD." },
  { label: "Pet Simulator", prompt: "Build a pet simulator template with eggs, hatching, weighted rarities, pet inventory, pet followers, coin multipliers, shop UI, trading-ready storage, and saving." },
  { label: "Zombie Survival", prompt: "Build a zombie survival template with waves, safe zone, gun shop, zombie NPC AI, rewards, health UI, leaderboard, DataStore saving, and scan_project." },
  { label: "Racing", prompt: "Build a racing template with safe Toolbox track/vehicle assets, laps, checkpoints, race timer, leaderboard, vehicle spawning, and mobile controls." },
  { label: "BedWars Style", prompt: "Build a BedWars-style template with safe arena/island assets, teams, beds, generators, item shop, round win logic, respawns, and anti-exploit validation." },
  { label: "Fighting Arena", prompt: "Build a fighting arena template with safe arena/weapon assets, combat system, rounds, score UI, rewards, and server hit validation." },
  { label: "City Builder", prompt: "Build a city builder template with safe building/road assets, plot system, placement grid, catalog UI, server placement validation, and saving." },
  { label: "Roleplay City", prompt: "Build a roleplay city template with safe city/road/building assets, teams/jobs, vehicles, spawn lobby, map labels, and role UI." },
  { label: "Dungeon RPG", prompt: "Build a dungeon RPG template with safe dungeon/enemy/NPC assets, quests, combat, loot, inventory, boss room, XP/levels, and saving." },
  { label: "Tower Defense", prompt: "Build a tower defense template with safe map/tower/enemy assets, path waypoints, wave manager, tower placement, cash rewards, base health UI, and saving." },
  { label: "Police Chase", prompt: "Build a police chase template with safe city/road/police car assets, teams, wanted system, vehicle spawns, jail/safe zone, rewards, and objective UI." },
  { label: "Horror Escape", prompt: "Build a horror escape template with safe horror/house/corridor assets, flashlight, objectives, monster AI, jumpscare UI, sounds, lighting, and checkpoints." },
  { label: "Cooking Game", prompt: "Build a cooking game template with safe cafe/kitchen/food assets, customers, order queue, recipes, timers, earnings, upgrades, shop UI, and saving." },
];

const AGENTS = [
  { name: "Asset Agent", icon: Box, job: "Safe free Toolbox models" },
  { name: "Builder Agent", icon: Hammer, job: "Map, lighting, folders" },
  { name: "Scripter Agent", icon: FileCode, job: "Luau systems and remotes" },
  { name: "UI Agent", icon: LayoutDashboard, job: "Menus, HUD, mobile" },
  { name: "Tester Agent", icon: Bug, job: "Scans and fixes" },
  { name: "Optimizer Agent", icon: Gauge, job: "Cleanup and performance" },
  { name: "Memory Agent", icon: BookOpen, job: "Project rules and history" },
];

const BRAIN_SYSTEMS = [
  { name: "Knowledge", detail: "Roblox Studio, Luau, services, UI, NPCs, plugins", icon: Cpu },
  { name: "Planning", detail: "Breaks requests into build order and systems", icon: Lightbulb },
  { name: "Execution", detail: "Creates scripts, UI, remotes, assets, folders", icon: Upload },
  { name: "Assets", detail: "Safe free Toolbox / Creator Store models", icon: Box },
  { name: "Testing", detail: "Scans scripts, remotes, UI, NPCs, mobile, saves", icon: ScanLine },
  { name: "Fixing", detail: "Autofixes, retests, and explains what changed", icon: Wrench },
  { name: "Memory", detail: "Remembers rules, style, assets, and prior fixes", icon: BookOpen },
  { name: "Quality", detail: "Premium, organized, mobile-friendly, playable", icon: Crown },
];

const CREDIT_GUIDE = [
  ["Chat", "1"],
  ["Script", "5"],
  ["UI", "10"],
  ["Assets", "10"],
  ["Full game", "50-150"],
  ["Scan", "10"],
  ["Fix", "15"],
  ["Playtest", "20"],
  ["Premium", "25"],
];

const BUILD_STEPS = [
  { key: "planning",  label: "Planning game systems",     icon: Cpu },
  { key: "assets",    label: "Searching Toolbox assets",  icon: Search },
  { key: "scripts",   label: "Generating scripts & systems", icon: FileCode },
  { key: "ui",        label: "Creating UI",               icon: LayoutDashboard },
  { key: "actions",   label: "Preparing Studio actions",  icon: Box },
  { key: "sending",   label: "Sending to Roblox Studio",  icon: Upload },
  { key: "testing",   label: "Testing & fixing",          icon: Wrench },
] as const;

const SIDEBAR_NAV: { label: string; icon: typeof Box; to?: string; soon?: boolean; key: string }[] = [
  { key: "chat",   label: "AI Chat",         icon: MessageSquare, to: "/chat" },
  { key: "proj",   label: "Projects",        icon: Folder,    to: "/dashboard" },
  { key: "ideas",  label: "Game Ideas",      icon: Lightbulb, to: "/ideas" },
  { key: "ui",     label: "UI Generator",    icon: LayoutDashboard, to: "/ui-generator" },
  { key: "mcp",    label: "MCP / Tools",     icon: Plug,      to: "/mcp" },
  { key: "co",     label: "Collaborators",   icon: Users,     to: "/collaborators" },
  { key: "plug",   label: "Studio Plugin",   icon: Radio,     to: "/plugin" },
  { key: "hist",   label: "History",         icon: History,   to: "/history" },
  { key: "set",    label: "Settings",        icon: SettingsIcon, to: "/settings" },
];

function ProjectPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const projectFn = useServerFn(getProject);
  const projectsFn = useServerFn(listProjects);
  const messagesFn = useServerFn(listMessages);
  const actionsFn  = useServerFn(listProjectActions);
  const sessionFn  = useServerFn(getPluginSession);
  const profileFn  = useServerFn(getMyProfile);
  const clearMessagesFn = useServerFn(clearMessages);
  const queueCommandFn = useServerFn(queuePluginCommand);
  const queueFixAllFn = useServerFn(queueFixAll);
  const queueTestInsertFn = useServerFn(queueTestInsert);

  const { data: project } = useQuery({ queryKey: ["project", projectId], queryFn: () => projectFn({ data: { id: projectId } }) });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => projectsFn() });
  const { data: history = [] } = useQuery({ queryKey: ["messages", projectId], queryFn: () => messagesFn({ data: { projectId } }) });
  const { data: actions = [] } = useQuery({
    queryKey: ["actions", projectId],
    queryFn: () => actionsFn({ data: { projectId } }),
    refetchInterval: 1000,
  });
  const { data: pluginSession } = useQuery({
    queryKey: ["pluginSession"],
    queryFn: () => sessionFn(),
    refetchInterval: 2000,
  });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn(), refetchInterval: 30000 });

  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  // Chat-vs-Build mode: chat = brainstorm only (no actions), build = execute in Studio.
  const [mode, setMode] = useState<"chat" | "build">(() => {
    if (typeof window === "undefined") return "build";
    return (localStorage.getItem("bs-chat-mode") as "chat" | "build") || "build";
  });
  useEffect(() => { localStorage.setItem("bs-chat-mode", mode); }, [mode]);
  // Auto-execute: when true (default), Build-mode messages run in Studio immediately.
  // When false, BloxSmith drafts a plan and waits for the user to click Push to Studio.
  const [autoExecute, setAutoExecute] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("bs-auto-execute") !== "0";
  });
  useEffect(() => {
    localStorage.setItem("bs-auto-execute", autoExecute ? "1" : "0");
  }, [autoExecute]);
  const { lang: uiLang, t: tr } = useLang();
  const aiLanguageName = LANGUAGES.find((l) => l.code === uiLang)?.aiName ?? "English";
  const clearQueueFn = useServerFn(clearActionQueue);
  const undoFn = useServerFn(undoLastBuild);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!queueNotice) return;
    const t = setTimeout(() => setQueueNotice(null), 4000);
    return () => clearTimeout(t);
  }, [queueNotice]);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "default";
    return (localStorage.getItem("bs-chat-theme") as Theme) || "default";
  });
  useEffect(() => { localStorage.setItem("bs-chat-theme", theme); }, [theme]);

  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setToken(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const initialMessages = useMemo(
    () => history.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      parts: [{ type: "text" as const, text: m.content }],
    })),
    [history],
  );
  const historyImages = useMemo(() => new Map(history.map((m: any) => [m.id, m.image_url as string | null])), [history]);

  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest: async ({ messages, id, body, headers, trigger, messageId }) => {
      const { data } = await supabase.auth.getSession();
      const freshToken = data.session?.access_token;
      return {
        body: { ...(body ?? {}), id, messages, trigger, messageId },
        headers: freshToken ? { ...headers, Authorization: `Bearer ${freshToken}` } : headers,
      };
    },
  }), []);

  const { messages, sendMessage, status, error, stop } = useChat({
    id: projectId,
    transport,
    messages: initialMessages,
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ["messages", projectId] });
      qc.invalidateQueries({ queryKey: ["actions", projectId] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);
  useEffect(() => { textareaRef.current?.focus(); }, [projectId, status]);

  // Screenshot-to-game attachment
  type Attachment = { dataUrl: string; mediaType: string; name: string; build: boolean };
  const [attachment, setAttachment] = useState<Attachment | null>(null);

  async function attachImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 6 * 1024 * 1024) {
      alert("Image is too large — please pick an image under 6 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      if (!url) return;
      setAttachment({ dataUrl: url, mediaType: file.type || "image/png", name: file.name || "screenshot.png", build: true });
    };
    reader.readAsDataURL(file);
  }

  const busy = status === "submitted" || status === "streaming";

  async function submit(text?: string, forcedMode?: "chat" | "build") {
    const value = (text ?? input).trim();
    const att = attachment;
    if (!value && !att) return;
    if (busy) return;
    const { data } = await supabase.auth.getSession();
    const freshToken = data.session?.access_token ?? null;
    setToken(freshToken);
    if (!freshToken) return;

    // If the user is in Build mode but auto-execute is off, downgrade this
    // turn to chat-mode planning. The Push to Studio button below executes it.
    const baseMode = forcedMode ?? mode;
    const effectiveMode: "chat" | "build" =
      baseMode === "build" && !autoExecute && !forcedMode ? "chat" : baseMode;

    if (att) {
      const modeHeader = att.build
        ? "[SCREENSHOT-TO-GAME MODE: BUILD] The user attached a screenshot/reference image. Analyze it like a Roblox art director and systems designer: identify the game genre, map theme, terrain, buildings, rooms, roads/paths, props, lighting, colors, camera angle, UI style, mood, player objective, NPC/enemy/vehicle/tool clues, and the minimum playable gameplay loop. Recreate a Roblox version using safe free Toolbox / Creator Store assets first. Do a wide Toolbox search for every visual asset category you infer from the screenshot, insert real relevant free assets, place/scale/rotate them cleanly, build the matching UI/scripts/remotes/game systems, and finish with organize_project, autofix_project, and scan_project. Never make procedural placeholder scenery, fake models, empty folders, or unfinished buttons. If the screenshot is UI-focused, convert it into real Roblox ScreenGui objects and scripts; if it is map/gameplay-focused, build the map plus playable systems."
        : "[SCREENSHOT MODE: ANALYZE ONLY] The user attached a reference screenshot. Describe what it shows, what Roblox systems would recreate it, and outline a build plan. Do NOT queue or execute build actions for this message.";
      const promptText = value || (att.build ? "Build a complete Roblox game/UI that matches this screenshot." : "Analyze this screenshot.");
      sendMessage(
        {
          role: "user",
          parts: [
            { type: "text", text: `${modeHeader}\n\n${promptText}` },
            { type: "file", mediaType: att.mediaType, url: att.dataUrl } as any,
          ],
        } as any,
        { body: { projectId, modelId, mode: att.build ? effectiveMode : "chat", language: uiLang, languageName: aiLanguageName } },
      );
    } else {
      sendMessage(
        { text: value },
        { body: { projectId, modelId, mode: effectiveMode, language: uiLang, languageName: aiLanguageName } },
      );
    }
    setInput("");
    setAttachment(null);
  }

  // Push the last assistant plan to Roblox Studio (used when auto-execute is off
  // or when the user wants to re-run the latest plan as real actions).
  async function pushToStudio() {
    if (busy) return;
    sendMessage(
      { text: "Push the plan you just described to Roblox Studio now — emit the bloxsmith-actions block and execute it." },
      { body: { projectId, modelId, mode: "build" as const, language: uiLang, languageName: aiLanguageName } },
    );
  }

  async function runComposerAction(action: any) {
    if (!action) return;
    if (action.command === "fix_all") {
      try {
        const res: any = await queueFixAllFn({ data: { projectId } });
        setQueueNotice(res?.ok ? `Fix All queued ${res.count ?? 4} Studio checks and repairs.` : "Could not queue Fix All.");
        await qc.invalidateQueries({ queryKey: ["actions", projectId] });
      } catch (e: any) {
        setQueueNotice(`Could not queue Fix All: ${e?.message ?? "unknown error"}`);
      }
      return;
    }
    if (action.command === "test_insert") {
      try {
        const res: any = await queueTestInsertFn({ data: { projectId } });
        setQueueNotice(res?.ok ? `Test Insert queued ${res.count ?? 4} actions for Roblox Studio.` : "Could not queue Test Insert.");
        await qc.invalidateQueries({ queryKey: ["actions", projectId] });
      } catch (e: any) {
        setQueueNotice(`Could not queue Test Insert: ${e?.message ?? "unknown error"}`);
      }
      return;
    }
    if (action.command) {
      try {
        const res: any = await queueCommandFn({
          data: {
            projectId,
            kind: action.command,
            name: action.label,
          },
        });
        setQueueNotice(res?.ok ? `${action.label} queued for Roblox Studio.` : `Could not queue ${action.label}.`);
        await qc.invalidateQueries({ queryKey: ["actions", projectId] });
      } catch (e: any) {
        setQueueNotice(`Could not queue ${action.label}: ${e?.message ?? "unknown error"}`);
      }
      return;
    }
    submit(action.prompt, action.mode);
  }



  const pluginOnline = !!(pluginSession?.online && pluginSession?.last_seen &&
    (Date.now() - new Date(pluginSession.last_seen).getTime() < 30_000));
  const actionsByMessage = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const action of actions ?? []) {
      if (!action.message_id) continue;
      const rows = map.get(action.message_id) ?? [];
      rows.push(action);
      map.set(action.message_id, rows);
    }
    return map;
  }, [actions]);
  const latestActionRows = useMemo(() => {
    return [...(actions ?? [])].sort((a, b) => {
      const at = new Date(a.created_at ?? 0).getTime();
      const bt = new Date(b.created_at ?? 0).getTime();
      return bt - at;
    });
  }, [actions]);

  const isAdmin = !!profile?.is_admin;
  const credits = profile?.credits ?? 0;
  const maxCredits = profile?.max_credits ?? 0;
  const lowCredits = !isAdmin && maxCredits > 0 && credits / maxCredits < 0.2;
  const resetAt = profile?.credits_reset_at ? new Date(profile.credits_reset_at).getTime() : 0;
  const [resetLabel, setResetLabel] = useState<string>("");
  useEffect(() => {
    if (isAdmin || !resetAt) return;
    const tick = () => {
      const ms = Math.max(0, resetAt - Date.now());
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setResetLabel(h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isAdmin, resetAt]);
  const [showTour, setShowTour] = useState(false);

  // ── voice mode (BloxSmith speaks replies via ElevenLabs) ──
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("bs-tts-enabled") !== "0";
  });
  useEffect(() => {
    localStorage.setItem("bs-tts-enabled", ttsEnabled ? "1" : "0");
  }, [ttsEnabled]);
  const { speak, stop: stopSpeak, speaking, loading: voiceLoading, error: voiceError } = useBloxSmithSpeaker(ttsEnabled);
  const spokenIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "ready") return;
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    if (spokenIdRef.current === null) {
      spokenIdRef.current = last.id;
      return;
    }
    if (!ttsEnabled || spokenIdRef.current === last.id) return;
    const text = last.parts.map((p: any) => (p.type === "text" ? p.text : "")).join("");
    if (!text.trim()) return;
    spokenIdRef.current = last.id;
    speak(text);
  }, [messages, status, ttsEnabled, speak]);
  useEffect(() => {
    if (!ttsEnabled) stopSpeak();
  }, [ttsEnabled, stopSpeak]);

  // build step progression (visual only)
  const buildStepIndex = useMemo(() => {
    if (status === "submitted") return 0;
    if (status === "streaming") {
      const recent = actions[0];
      if (!recent) return 1;
      if (recent.status === "sent") return 5;
      if (recent.status === "failed") return 6;
      if (recent.status === "pending") return 4;
      return 2;
    }
    return -1;
  }, [status, actions]);
  const buildPct = buildStepIndex < 0 ? 100 : Math.round(((buildStepIndex + 1) / BUILD_STEPS.length) * 100);
  const buildLabel = buildStepIndex < 0 ? "Idle — ready for your next prompt" : BUILD_STEPS[Math.min(buildStepIndex, BUILD_STEPS.length - 1)].label;

  // theme class on root
  const themeClass = theme === "light" ? "bloxchat-light" : theme === "grey" ? "bloxchat-grey" : "bloxchat-dark";

  return (
    <div className={`${themeClass} flex h-screen min-h-0 w-full overflow-hidden`} style={{ color: "var(--bs-fg)" }}>
      <OnboardingTour
        storageKey="bs-onboarding-project"
        force={showTour}
        onFinish={() => setShowTour(false)}
        steps={[
          { title: "Welcome to BloxSmith 🛠️", body: "This is your AI command center for Roblox. Describe what you want — tycoons, obbies, RPGs — and BloxSmith plans it, writes the Luau, and queues it for Studio." },
          { title: "Roblox Studio", body: "The right panel shows whether your Studio plugin is connected. If it's offline, click 'Studio Plugin' in the left nav to install it and paste your token." },
          { title: "Quick actions", body: "Bottom bar has Toolbox, UI Generator, Improve, Fix Errors, and Explain. They're one-tap follow-ups that send a smart prompt for you." },
          { title: "Credits & timer", body: "Everyone gets 100 free credits that refill every 24 hours — you'll see a live countdown in the header. Owners get unlimited.", cta: "Start building" },
        ]}
      />

      {/* LEFT SIDEBAR */}
      <LeftSidebar
        theme={theme}
        setTheme={setTheme}
        credits={credits}
        maxCredits={maxCredits}
        isAdmin={isAdmin}
        resetLabel={resetLabel}
      />

      {/* MAIN COLUMN */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          project={project}
          projects={projects}
          modelId={modelId}
          setModelId={setModelId}
          credits={credits}
          maxCredits={maxCredits}
          isAdmin={isAdmin}
          resetLabel={resetLabel}
          profile={profile}
          onTour={() => setShowTour(true)}
        />

        <div className="flex min-h-0 flex-1">
          {/* CENTER — chat */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6 sm:px-8"
            >
              <div className="mx-auto flex max-w-3xl flex-col gap-5">
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--bs-primary)" }}>
                  <Sparkles className="h-4 w-4" /> AI Chat
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm("Clear this project's chat history and queued actions? This can't be undone.")) return;
                      try {
                        await clearMessagesFn({ data: { projectId } });
                        await qc.invalidateQueries({ queryKey: ["messages", projectId] });
                        await qc.invalidateQueries({ queryKey: ["actions", projectId] });
                        window.location.reload();
                      } catch (e) {
                        alert("Failed to clear chat: " + (e instanceof Error ? e.message : String(e)));
                      }
                    }}
                    className="bs-quick"
                    title="Wipe chat memory and queued plugin actions for this project"
                  >
                    <RotateCcw className="h-3 w-3" /> Clear chat
                  </button>
                </div>

                {messages.length === 0 && (
                  <WelcomeCard
                    name={profile?.display_name || profile?.username || "builder"}
                    onPrompt={(p) => submit(p)}
                  />
                )}

                {(() => {
                  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
                  return messages.map((m) => {
                    const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
                    const imageUrl = historyImages.get(m.id) ?? null;
                    const isUser = m.role === "user";
                    if (isUser) return <UserBubble key={m.id} text={text} imageUrl={imageUrl} profile={profile} />;
                    const isLatest = m.id === lastAssistantId;
                    const actionRows = actionsByMessage.get(m.id) ?? [];
                    return (
                      <AssistantCard
                        key={m.id}
                        text={text}
                        imageUrl={imageUrl}
                        projectId={projectId}
                        pluginOnline={pluginOnline}
                        actionRows={actionRows}
                        latestActionRows={latestActionRows}
                        isLatest={isLatest}
                      />
                    );
                  });
                })()}

                {busy && (
                  <BuildProgressCard
                    stepIndex={buildStepIndex}
                    onStop={stop}
                    onAction={(p: string) => submit(p)}
                  />
                )}

                {error && (
                  <div
                    className="flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm"
                    style={{
                      borderColor: "color-mix(in oklab, var(--bs-danger) 40%, transparent)",
                      background: "color-mix(in oklab, var(--bs-danger) 10%, transparent)",
                      color: "var(--bs-danger)",
                    }}
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">Something went wrong</div>
                      <div className="opacity-80">{error.message || "Please try again."}</div>
                    </div>
                    <button
                      onClick={() => {
                        const lastUser = [...messages].reverse().find((mm) => mm.role === "user");
                        const t = lastUser?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
                        submit(t);
                      }}
                      className="bs-quick shrink-0"
                    >
                      <RotateCcw className="h-3 w-3" /> Retry
                    </button>
                  </div>
                )}
              </div>
            </div>

            <Composer
              input={input}
              setInput={setInput}
              textareaRef={textareaRef}
              busy={busy}
              token={token}
              mode={mode}
              setMode={setMode}
              onClearQueue={async () => {
                if (!confirm("Stop the build and cancel everything currently queued for Roblox Studio? Chat history is kept.")) return;
                try {
                  const res: any = await clearQueueFn({ data: { projectId } });
                  setQueueNotice(`Build stopped — cleared ${res?.cleared ?? 0} queued action${res?.cleared === 1 ? "" : "s"}.`);
                  await qc.invalidateQueries({ queryKey: ["actions", projectId] });
                } catch (e: any) {
                  setQueueNotice(`Couldn't clear queue: ${e?.message ?? "unknown error"}`);
                }
              }}
              onUndoLast={async () => {
                if (!confirm("Undo the last build? Queued actions for the most recent reply will be cancelled. Open Roblox Studio and press Ctrl+Z to revert anything that already ran.")) return;
                try {
                  const res: any = await undoFn({ data: { projectId } });
                  setQueueNotice(res?.ok ? `Last build undone — cleared ${res?.cleared ?? 0} action${res?.cleared === 1 ? "" : "s"}. In Studio press Ctrl+Z to revert.` : "Nothing to undo yet.");
                  await qc.invalidateQueries({ queryKey: ["actions", projectId] });
                  await qc.invalidateQueries({ queryKey: ["messages", projectId] });
                } catch (e: any) {
                  setQueueNotice(`Couldn't undo: ${e?.message ?? "unknown error"}`);
                }
              }}
              queueNotice={queueNotice}
              onSubmit={() => submit()}
              onStop={() => stop()}
              onAction={runComposerAction}
              modelId={modelId}
              setModelId={setModelId}
              ttsEnabled={ttsEnabled}
              setTtsEnabled={setTtsEnabled}
              voiceSpeaking={speaking}
              voiceLoading={voiceLoading}
              voiceError={voiceError}
              onVoiceTranscript={(t: string) => submit(t)}
              attachment={attachment}
              setAttachment={setAttachment}
              onAttachFile={attachImageFile}
              autoExecute={autoExecute}
              setAutoExecute={setAutoExecute}
              onPushToStudio={pushToStudio}
            />


          </div>

          {/* RIGHT SIDEBAR */}
          <RightSidebar
            project={project}
            pluginOnline={pluginOnline}
            pluginSession={pluginSession}
            actions={actions}
            buildPct={buildPct}
            buildLabel={buildLabel}
            busy={busy}
            onAction={runComposerAction}
            onPrompt={(p: string) => submit(p, "build")}
          />
        </div>
      </div>
    </div>
  );
}

/* ────────────────── LEFT SIDEBAR ────────────────── */
function LeftSidebar({
  theme, setTheme, credits, maxCredits, isAdmin, resetLabel,
}: {
  theme: Theme; setTheme: (t: Theme) => void;
  credits: number; maxCredits: number; isAdmin: boolean; resetLabel: string;
}) {
  return (
    <aside
      className="hidden w-64 shrink-0 flex-col border-r p-3 md:flex"
      style={{ background: "var(--bs-card)", borderColor: "var(--bs-border)" }}
    >
      <Link to="/dashboard" className="flex items-center gap-2.5 px-2 py-2">
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl ring-1 ring-[var(--bs-border)]" style={{ background: "var(--bs-card-2)" }}>
          <img src={bloxLogo.url} alt="BloxSmith" className="bs-logo-float h-10 w-10 object-contain" />
        </div>
        <div className="leading-tight">
          <div className="font-display text-base font-bold tracking-tight">BloxSmith</div>
          <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--bs-muted-fg)" }}>AI game builder</div>
        </div>
      </Link>

      <nav className="mt-4 flex flex-col gap-0.5 text-sm">
        {isAdmin && (
          <Link to="/admin">
            <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-[var(--bs-card-2)]" style={{ color: "var(--bs-primary)" }}>
              <Crown className="h-4 w-4" />
              <span className="flex-1 truncate">Owner Admin</span>
            </div>
          </Link>
        )}
        {SIDEBAR_NAV.map((item) => {
          const Inner = (
            <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-[var(--bs-card-2)]" style={{ color: "var(--bs-fg)" }}>
              <item.icon className="h-4 w-4 opacity-75" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.soon && (
                <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                  style={{ background: "var(--bs-card-2)", color: "var(--bs-muted-fg)" }}>
                  soon
                </span>
              )}
            </div>
          );
          return item.to
            ? <Link key={item.key} to={item.to}>{Inner}</Link>
            : <div key={item.key} className="cursor-not-allowed opacity-90">{Inner}</div>;
        })}
      </nav>

      <div className="flex-1" />

      {/* 100% Free Forever */}
      <div className="bs-soft relative mb-3 overflow-hidden p-4">
        <div className="absolute inset-0 opacity-25" style={{ background: "var(--bs-grad)" }} />
        <div className="relative">
          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--bs-primary)" }}>
            <Sparkles className="h-3 w-3" /> 100% Free Forever
          </div>
          <p className="mt-1 text-xs leading-snug" style={{ color: "var(--bs-muted-fg)" }}>
            No hidden limits. Build anything you imagine. Always free.
          </p>
        </div>
      </div>

      {/* Credits */}
      <div className="bs-soft mb-3 p-4">
        <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Your Credits</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          {isAdmin ? (
            <>
              <InfinityIcon className="h-5 w-5" style={{ color: "var(--bs-primary)" }} />
              <span className="text-2xl font-bold" style={{ color: "var(--bs-primary)" }}>Unlimited</span>
            </>
          ) : (
            <>
              <Zap className="h-4 w-4" style={{ color: "var(--bs-primary)" }} />
              <span className="text-2xl font-bold" style={{ color: "var(--bs-primary)" }}>{credits}</span>
              <span className="text-xs" style={{ color: "var(--bs-muted-fg)" }}>/ {maxCredits}</span>
            </>
          )}
        </div>
        {!isAdmin && (
          <>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--bs-card-2)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (credits / Math.max(1, maxCredits)) * 100)}%`, background: "var(--bs-grad)" }} />
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
              <Timer className="h-3 w-3" /> Resets in {resetLabel || "…"}
            </div>
          </>
        )}
      </div>

      {/* Theme */}
      <div className="bs-soft p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Theme</div>
        <div className="grid grid-cols-3 gap-1.5">
          {(["default", "grey", "light"] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className="bs-quick justify-center"
              style={theme === t ? { background: "var(--bs-primary-soft)", borderColor: "var(--bs-primary)", color: "var(--bs-primary)" } : {}}
            >
              {t === "light" ? <Sun className="h-3 w-3" /> : t === "grey" ? <Moon className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              <span className="capitalize">{t}</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function CreditUsageCard({ credits, maxCredits, resetLabel, resetAtIso }: { credits: number; maxCredits: number; resetLabel?: string; resetAtIso?: string | null }) {
  const remainingPct = maxCredits > 0 ? Math.max(0, Math.min(100, Math.round((credits / maxCredits) * 100))) : 0;
  const resetTime = resetAtIso
    ? new Date(resetAtIso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : "soon";
  return (
    <div className="hidden min-w-[260px] rounded-2xl border px-4 py-3 shadow-xl xl:block" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold">{remainingPct}% usage remaining</div>
          <div className="mt-0.5 text-xs leading-snug" style={{ color: "var(--bs-muted-fg)" }}>
            Resets every 24 hours · Next reset is at {resetTime}
            {resetLabel ? ` · ${resetLabel} left` : ""}
          </div>
        </div>
        <Zap className="h-4 w-4 shrink-0" style={{ color: "var(--bs-primary)" }} />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--bs-card-2)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${remainingPct}%`, background: "var(--bs-fg)" }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link to="/donate" className="rounded-xl border px-3 py-2 text-center text-xs font-semibold" style={{ borderColor: "var(--bs-border)" }}>
          Add credits
        </Link>
        <Link to="/settings" className="rounded-xl px-3 py-2 text-center text-xs font-semibold" style={{ background: "var(--bs-fg)", color: "var(--bs-bg)" }}>
          Upgrade
        </Link>
      </div>
    </div>
  );
}

/* ────────────────── TOP BAR ────────────────── */
function TopBar({
  project, projects, modelId, setModelId, credits, maxCredits, isAdmin, resetLabel, profile, onTour,
}: any) {
  return (
    <header
      className="flex items-center gap-2 border-b px-3 py-2.5 sm:px-5"
      style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)" }}
    >
      <MobileNavTrigger isAdmin={isAdmin} className="md:hidden" />
      {/* Project selector */}

      <div className="bs-soft flex min-w-0 items-center gap-2 px-2.5 py-1.5">
        <Folder className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--bs-muted-fg)" }} />
        <div className="hidden text-[10px] uppercase tracking-wider sm:block" style={{ color: "var(--bs-muted-fg)" }}>Project</div>
        <select
          value={project?.id ?? ""}
          onChange={(e) => { if (e.target.value) window.location.assign(`/project/${e.target.value}`); }}
          className="max-w-[180px] truncate bg-transparent text-sm font-semibold outline-none"
          style={{ color: "var(--bs-fg)" }}
        >
          {projects.map((p: { id: string; name: string }) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className="ml-1 hidden items-center gap-1 text-[11px] sm:flex" style={{ color: "var(--bs-success)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--bs-success)" }} /> Saved
        </span>
      </div>

      {/* Model selector */}
      <div className="hidden lg:block">
        <ModelPicker modelId={modelId} setModelId={setModelId} variant="bar" />
      </div>

      <div className="flex-1" />

      {/* Credits */}
      {isAdmin ? (
        <div className="bs-soft hidden items-center gap-1.5 px-2.5 py-1.5 sm:flex" title="Unlimited (owner)">
          <InfinityIcon className="h-3.5 w-3.5" style={{ color: "var(--bs-primary)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--bs-primary)" }}>Unlimited</span>
        </div>
      ) : (
        <CreditUsageCard credits={credits} maxCredits={maxCredits} resetLabel={resetLabel} resetAtIso={profile?.credits_reset_at} />
      )}

      {/* Reset timer */}
      {!isAdmin && resetLabel && (
        <div className="bs-soft hidden items-center gap-1.5 px-2.5 py-1.5 md:flex" title="Time until credits refill">
          <Timer className="h-3.5 w-3.5" style={{ color: "var(--bs-muted-fg)" }} />
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Resets in</div>
            <div className="text-xs font-semibold">{resetLabel}</div>
          </div>
        </div>
      )}

      {/* Notifications */}
      <button className="bs-icon-btn" title="Notifications" aria-label="Notifications">
        <Bell className="h-4 w-4" />
      </button>
      {/* Help / Tour */}
      <button onClick={onTour} className="bs-icon-btn" title="Replay tour" aria-label="Help">
        <HelpCircle className="h-4 w-4" />
      </button>

      {/* User profile */}
      <div className="bs-soft flex items-center gap-2 px-2 py-1.5">
        <div className="grid h-7 w-7 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: "var(--bs-grad)" }}>
          {(profile?.display_name || profile?.username || "U").slice(0, 1).toUpperCase()}
        </div>
        <div className="hidden leading-tight sm:block">
          <div className="flex items-center gap-1 text-xs font-semibold">
            {profile?.display_name || profile?.username || "You"}
            {isAdmin && <span title="Owner" className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: "color-mix(in oklab, var(--bs-warning) 18%, transparent)", color: "var(--bs-warning)" }}><Crown className="h-2.5 w-2.5" /> Owner</span>}
          </div>
          <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--bs-success)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--bs-success)" }} /> Online
          </div>
        </div>
      </div>
    </header>
  );
}

/* ────────────────── CENTER — chat pieces ────────────────── */
function WelcomeCard({ name, onPrompt }: { name: string; onPrompt: (s: string) => void }) {
  const display = (name || "builder").charAt(0).toUpperCase() + (name || "builder").slice(1);
  return (
    <div className="bs-card bs-msg-in relative overflow-hidden rounded-2xl p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-30 blur-3xl" style={{ background: "var(--bs-grad)" }} />
      <div className="relative flex items-start gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl ring-1 ring-[var(--bs-border)]" style={{ background: "var(--bs-card-2)" }}>
          <img src={bloxLogo.url} alt="BloxSmith" className="bs-logo-float h-16 w-16 object-contain" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display flex items-center gap-2 text-2xl font-bold">Hi {display}! <span className="text-2xl">👋</span></h2>
          <p className="mt-1 text-sm" style={{ color: "var(--bs-muted-fg)" }}>I'm BloxSmith, your AI Roblox game developer.</p>
          <p className="text-sm" style={{ color: "var(--bs-muted-fg)" }}>Tell me your game idea and I'll build it step by step!</p>
        </div>
      </div>
      <div className="bs-stagger mt-5 flex flex-wrap gap-2">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q.label}
            onClick={() => onPrompt(q.prompt)}
            className="bs-quick"
            style={{ borderColor: "var(--bs-border)" }}
          >
            <q.icon className="h-3.5 w-3.5" style={{ color: "var(--bs-primary)" }} /> {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className="mt-3 max-h-72 w-full max-w-xl rounded-xl border object-contain"
      style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}
    />
  );
}

function UserBubble({ text, imageUrl, profile }: { text: string; imageUrl?: string | null; profile: any }) {
  return (
    <div className="bs-msg-in flex justify-end gap-2.5">
      <div
        className="max-w-[78%] rounded-2xl px-4 py-3 text-sm font-medium shadow-sm"
        style={{ background: "var(--bs-primary)", color: "var(--bs-primary-fg)" }}
      >
        {text}
        {imageUrl && <ChatImage src={imageUrl} alt="Uploaded reference" />}
      </div>
      <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white" style={{ background: "var(--bs-grad)" }}>
        {(profile?.display_name || profile?.username || "U").slice(0, 1).toUpperCase()}
      </div>
    </div>
  );
}

function AssistantCard({
  text,
  imageUrl,
  projectId,
  pluginOnline,
  actionRows = [],
  latestActionRows = [],
  isLatest = false,
  autoExecute = true,
}: {
  text: string;
  imageUrl?: string | null;
  projectId: string;
  pluginOnline?: boolean;
  actionRows?: any[];
  latestActionRows?: any[];
  isLatest?: boolean;
  autoExecute?: boolean;
}) {
  const qc = useQueryClient();
  const queuePreparedFn = useServerFn(queuePreparedStudioActions);
  // Strip the trailing bloxsmith-actions JSON block — it's executed by the
  // plugin, not meant for the user to read. Surface a friendly build banner instead.
  const actionsMatch = text.match(/```bloxsmith-actions\s*\n?([\s\S]*?)```/i);
  let displayText = text;
  let actionCount = 0;
  let rawActions = "";
  let parsedActions: any[] = [];
  if (actionsMatch) {
    rawActions = actionsMatch[1].trim();
    displayText = text.replace(actionsMatch[0], "").trimEnd();
    try {
      const parsed = JSON.parse(rawActions);
      if (Array.isArray(parsed)) parsedActions = parsed;
      else if (Array.isArray(parsed?.actions)) parsedActions = parsed.actions;
      actionCount = parsedActions.length;
    } catch {
      actionCount = 0;
    }
  }
  const [showRaw, setShowRaw] = useState(false);
  const [forceBusy, setForceBusy] = useState(false);
  const [forceErr, setForceErr] = useState<string | null>(null);
  const autoQueueKeyRef = useRef<string | null>(null);
  const visibleActionRows = useMemo(() => {
    if (actionRows.length > 0 || !isLatest || actionCount <= 0) return actionRows;
    const recentCutoff = Date.now() - 2 * 60_000;
    const recent = latestActionRows.filter((a) => {
      const createdAt = new Date(a.created_at ?? 0).getTime();
      return Number.isFinite(createdAt) && createdAt >= recentCutoff;
    });
    return recent.slice(0, actionCount);
  }, [actionRows, latestActionRows, isLatest, actionCount]);
  const queued = visibleActionRows.filter((a) => a.status === "pending").length;
  const executing = visibleActionRows.filter((a) => a.status === "sent").length;
  const done = visibleActionRows.filter((a) => a.status === "done").length;
  const failed = visibleActionRows.filter((a) => a.status === "failed").length;
  const firstError = visibleActionRows.find((a) => a.status === "failed" && a.error)?.error;
  const confirmed = visibleActionRows.length > 0 && failed === 0 && queued === 0 && executing === 0 && done === visibleActionRows.length;
  const waitingForRows = actionCount > 0 && visibleActionRows.length === 0 && isLatest;
  const hasDangerousAction = parsedActions.some((a) => {
    const kind = String(a?.kind || "").toLowerCase();
    const source = JSON.stringify(a?.payload || {}).toLowerCase();
    return kind === "delete" || (kind === "run_lua" && /\b(destroy|clearallchildren|remove)\b/.test(source));
  });

  async function forceExecuteNow(auto = false) {
    if (forceBusy || parsedActions.length === 0) return;
    if (!auto && hasDangerousAction && !confirm("This build includes delete or destructive Lua actions. Execute it in Roblox Studio now?")) return;
    setForceBusy(true);
    setForceErr(null);
    try {
      const res: any = await queuePreparedFn({
        data: {
          projectId,
          actions: parsedActions.map((a) => ({
            kind: String(a?.kind || "script").trim() || "script",
            parent_path: String(a?.parent_path || a?.target_parent_path || "").trim() || "Workspace",
            name: String(a?.name || a?.target_path || "").trim() || "BloxSmithAction",
            payload: a?.payload ?? {},
          })),
        },
      });
      autoQueueKeyRef.current = rawActions;
      await qc.invalidateQueries({ queryKey: ["actions", projectId] });
      if (!res?.ok) setForceErr("Could not queue Studio actions.");
    } catch (e) {
      setForceErr(e instanceof Error ? e.message : "Could not queue Studio actions.");
    } finally {
      setForceBusy(false);
    }
  }

  useEffect(() => {
    // Plan Mode guard: if auto-execute is off, never fire automatically.
    if (!autoExecute || !waitingForRows || !pluginOnline || parsedActions.length === 0 || hasDangerousAction) return;
    if (autoQueueKeyRef.current === rawActions) return;
    const id = setTimeout(() => {
      if (autoQueueKeyRef.current !== rawActions) void forceExecuteNow(true);
    }, 1200);
    return () => clearTimeout(id);
  }, [autoExecute, waitingForRows, pluginOnline, rawActions, hasDangerousAction]);
  return (
    <div className="bs-msg-in flex gap-2.5">
      <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-[var(--bs-border)]" style={{ background: "var(--bs-card-2)" }}>
        <img src={bloxLogo.url} alt="BloxSmith" className="h-8 w-8 object-contain" />
      </div>
      <div className="bs-card max-w-[88%] flex-1 rounded-2xl p-4">
        <div className="bs-prose text-sm leading-relaxed">
          <ReactMarkdown>{displayText || "_…_"}</ReactMarkdown>
        </div>
        {imageUrl && <ChatImage src={imageUrl} alt="Generated Roblox UI concept" />}
        {actionCount > 0 && (
          <div className="mt-3 space-y-2">
            <div
              className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium"
              style={{
                borderColor: !pluginOnline
                  ? "color-mix(in oklab, var(--bs-danger) 40%, transparent)"
                  : failed > 0
                  ? "color-mix(in oklab, var(--bs-danger) 40%, transparent)"
                  : queued > 0 || executing > 0 || waitingForRows
                  ? "color-mix(in oklab, var(--bs-primary) 40%, transparent)"
                  : "color-mix(in oklab, var(--bs-success) 40%, transparent)",
                background: !pluginOnline
                  ? "color-mix(in oklab, var(--bs-danger) 10%, transparent)"
                  : failed > 0
                  ? "color-mix(in oklab, var(--bs-danger) 10%, transparent)"
                  : waitingForRows && !autoExecute
                  ? "color-mix(in oklab, var(--bs-warning, #eab308) 10%, transparent)"
                  : queued > 0 || executing > 0 || waitingForRows
                  ? "color-mix(in oklab, var(--bs-primary) 10%, transparent)"
                  : "color-mix(in oklab, var(--bs-success) 10%, transparent)",
                color: !pluginOnline
                  ? "var(--bs-danger)"
                  : failed > 0
                  ? "var(--bs-danger)"
                  : waitingForRows && !autoExecute
                  ? "var(--bs-warning, #eab308)"
                  : queued > 0 || executing > 0 || waitingForRows
                  ? "var(--bs-primary)"
                  : "var(--bs-success)",
              }}
            >
              {!pluginOnline ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5" />
                  Roblox Studio plugin is not connected. Open Studio and reconnect, then press Force Execute Now if these actions are not already queued.
                </>
              ) : failed > 0 ? (
                <>
                  <AlertCircle className="h-3.5 w-3.5" />
                  Roblox Studio failed {failed} {failed === 1 ? "action" : "actions"}{firstError ? `: ${firstError}` : "."}
                </>
              ) : executing > 0 ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Plugin received {executing} {executing === 1 ? "action" : "actions"} and is executing them in Studio.
                </>
              ) : queued > 0 ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Queued {queued} of {visibleActionRows.length || actionCount} {actionCount === 1 ? "action" : "actions"} for the Roblox plugin.
                </>
              ) : waitingForRows ? (
                <>
                  {autoExecute ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Prepared {actionCount} Studio {actionCount === 1 ? "action" : "actions"}. Sending to the Roblox plugin now&hellip;</>
                  ) : (
                    <><Save className="h-3.5 w-3.5" />
                    Plan ready &mdash; {actionCount} Studio {actionCount === 1 ? "action" : "actions"} prepared. Click <strong>Force Execute Now</strong> to send to Roblox Studio.</>
                  )}
                </>
              ) : confirmed ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Plugin confirmed {done} {done === 1 ? "action" : "actions"} completed in Roblox Studio.
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5" />
                  Studio confirmation is still pending for these actions.
                </>
              )}
            </div>
            {(waitingForRows || failed > 0) && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => forceExecuteNow(false)}
                  disabled={forceBusy || parsedActions.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                  style={{
                    borderColor: "color-mix(in oklab, var(--bs-primary) 45%, transparent)",
                    background: "color-mix(in oklab, var(--bs-primary) 14%, transparent)",
                    color: "var(--bs-primary)",
                  }}
                  title="Queue these prepared Studio actions directly for the Roblox plugin."
                >
                  {forceBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Force Execute Now
                </button>
                {hasDangerousAction && (
                  <span className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
                    Confirmation required because this build includes delete or destructive Lua actions.
                  </span>
                )}
              </div>
            )}
            {forceErr && (
              <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "color-mix(in oklab, var(--bs-danger) 35%, transparent)", background: "color-mix(in oklab, var(--bs-danger) 10%, transparent)", color: "var(--bs-danger)" }}>
                {forceErr}
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="text-xs underline opacity-60 hover:opacity-100"
              style={{ color: "var(--bs-muted-fg)" }}
            >
              {showRaw ? "Hide" : "View"} build actions (advanced)
            </button>
            {showRaw && (
              <pre className="max-h-64 overflow-auto rounded-lg border p-3 text-[11px]" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
                {rawActions}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function BuildProgressCard({ stepIndex, onStop, onAction }: { stepIndex: number; onStop: () => void; onAction: (p: string) => void }) {
  return (
    <div className="bs-msg-in flex gap-2.5">
      <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-[var(--bs-border)]" style={{ background: "var(--bs-card-2)" }}>
        <img src={bloxLogo.url} alt="BloxSmith" className="h-8 w-8 object-contain" />
      </div>
      <div className="bs-card flex-1 rounded-2xl p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="bs-typing"><span /><span /><span /></span>
          Building your game…
        </div>
        <ol className="mt-3 grid gap-1.5">
          {BUILD_STEPS.map((s, i) => {
            const state = i < stepIndex ? "done" : i === stepIndex ? "active" : "idle";
            return (
              <li key={s.key} className="flex items-center gap-2.5 text-xs" style={{ opacity: state === "idle" ? 0.55 : 1 }}>
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${state === "active" ? "bs-step-active" : ""}`}
                  style={{
                    background: state === "done" ? "color-mix(in oklab, var(--bs-success) 18%, transparent)"
                              : state === "active" ? "var(--bs-primary-soft)" : "var(--bs-card-2)",
                    color: state === "done" ? "var(--bs-success)" : state === "active" ? "var(--bs-primary)" : "var(--bs-muted-fg)",
                  }}
                >
                  {state === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                </span>
                <span style={{ fontWeight: state === "active" ? 600 : 400 }}>{s.label}</span>
                {state === "active" && <Loader2 className="ml-auto h-3 w-3 animate-spin" style={{ color: "var(--bs-primary)" }} />}
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <button onClick={onStop} className="bs-quick" style={{ color: "var(--bs-danger)", borderColor: "color-mix(in oklab, var(--bs-danger) 40%, transparent)" }}>
            <X className="h-3 w-3" /> Stop
          </button>
          <button onClick={() => onAction("Explain the plan you just produced in plain English.")} className="bs-quick">
            <HelpCircle className="h-3 w-3" /> Explain plan
          </button>
          <button onClick={() => onAction("List the Toolbox assets you used or recommended.")} className="bs-quick">
            <Box className="h-3 w-3" /> Show assets
          </button>
          <button onClick={() => onAction("Re-queue the latest build for the Roblox Studio plugin.")} className="bs-quick">
            <Upload className="h-3 w-3" /> Send to Studio
          </button>
          <button onClick={() => onAction("Inspect the current scripts and fix any errors or warnings you find.")} className="bs-quick">
            <Wrench className="h-3 w-3" /> Fix errors
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────── BOTTOM COMPOSER ────────────────── */
function Composer({
  input, setInput, textareaRef, busy, token,
  mode, setMode, onClearQueue, onUndoLast, queueNotice,
  onSubmit, onStop, onAction, modelId, setModelId,
  ttsEnabled, setTtsEnabled, voiceSpeaking, voiceLoading, voiceError, onVoiceTranscript,
  attachment, setAttachment, onAttachFile,
  autoExecute, setAutoExecute, onPushToStudio,
}: any) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLang();
  const canSend = !!token && !busy && (input.trim().length > 0 || !!attachment);
  const openScreenshotToGame = () => {
    setMode("build");
    fileInputRef.current?.click();
  };
  return (
    <div
      className="border-t px-3 pb-4 pt-3 sm:px-6"
      style={{ borderColor: "var(--bs-border)", background: "var(--bs-card)" }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        const file = Array.from(e.dataTransfer.files || []).find((f) => f.type?.startsWith("image/"));
        if (file) {
          setMode("build");
          onAttachFile?.(file);
        }
      }}
    >
      <div className="mx-auto w-full max-w-3xl">
        {queueNotice && (
          <div
            className="mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold"
            style={{
              borderColor: "color-mix(in oklab, var(--bs-primary) 40%, transparent)",
              background: "color-mix(in oklab, var(--bs-primary) 12%, transparent)",
              color: "var(--bs-primary)",
            }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {queueNotice}
          </div>
        )}
        {mode === "chat" && (
          <div
            className="mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px]"
            style={{
              borderColor: "var(--bs-border)",
              background: "var(--bs-card-2)",
              color: "var(--bs-muted-fg)",
            }}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{t("chat.chatBanner")}</span>
          </div>
        )}

        {attachment && (
          <div className="mb-2 flex items-center gap-3 rounded-xl border p-2"
               style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
            <img src={attachment.dataUrl} alt={attachment.name} className="h-14 w-14 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold" style={{ color: "var(--bs-fg)" }}>
                {attachment.name}
              </div>
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
                {attachment.build
                  ? "Screenshot to Game: BloxSmith will rebuild this as real Roblox assets, UI, and systems."
                  : "Analyze only: BloxSmith will describe the screenshot and plan the build."}
              </div>
              <div className="mt-1 inline-flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--bs-border)" }}>
                <button
                  type="button"
                  onClick={() => setAttachment({ ...attachment, build: true })}
                  className="px-2 py-1 text-[11px] font-bold"
                  style={{
                    background: attachment.build ? "var(--bs-primary)" : "transparent",
                    color: attachment.build ? "white" : "var(--bs-muted-fg)",
                  }}
                >
                  Build it
                </button>
                <button
                  type="button"
                  onClick={() => setAttachment({ ...attachment, build: false })}
                  className="px-2 py-1 text-[11px] font-bold"
                  style={{
                    background: !attachment.build ? "var(--bs-primary)" : "transparent",
                    color: !attachment.build ? "white" : "var(--bs-muted-fg)",
                  }}
                >
                  Just analyze
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="bs-icon-btn"
              title="Remove image"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="bs-input-wrap flex flex-col gap-2 px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e: any) => setInput(e.target.value)}
            onKeyDown={(e: any) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); }
            }}
            onPaste={(e: any) => {
              const file = Array.from(e.clipboardData?.files || []).find((f: any) => (f as File).type?.startsWith("image/")) as File | undefined;
              if (file) { e.preventDefault(); onAttachFile?.(file); }
            }}
            rows={1}
            placeholder={attachment ? (attachment.build ? "Optional: describe what you want built from this screenshot…" : "Optional: what should I analyze about this screenshot?") : "Describe anything you want to build…"}
            className="max-h-44 min-h-[40px] w-full resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:opacity-60"
            style={{ color: "var(--bs-fg)" }}
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <button className="bs-icon-btn" title="New" type="button" onClick={() => setInput("")}>
              <Plus className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onAttachFile?.(f);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <button
              className="bs-icon-btn"
              title="Attach screenshot"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              className="bs-quick"
              title="Screenshot to Game: upload a reference image and build it in Roblox Studio"
              type="button"
              disabled={busy}
              onClick={openScreenshotToGame}
              style={{ color: "var(--bs-primary)" }}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Screenshot to Game</span>
            </button>

            <ImprovePromptButton input={input} setInput={setInput} disabled={busy} />
            <VoiceControls
              ttsEnabled={ttsEnabled}
              setTtsEnabled={setTtsEnabled}
              voiceSpeaking={voiceSpeaking}
              voiceLoading={voiceLoading}
              voiceError={voiceError}
              onTranscript={(t: string, send: boolean) => {
                if (send) onVoiceTranscript?.(t);
                else setInput(t);
              }}
              busy={busy}
            />
            <VoiceBuildButton
              disabled={busy}
              setTtsEnabled={setTtsEnabled}
              onUtterance={(t: string) => { if (t.trim()) onVoiceTranscript?.(t.trim()); }}
            />

            {COMPOSER_ACTIONS.map((a) => (
              <button
                key={a.label}
                disabled={busy}
                onClick={() => onAction(a)}
                className="bs-quick"
                title={a.label}
              >
                <a.icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{a.label}</span>
              </button>
            ))}

            <div className="flex-1" />

            <div className="lg:hidden">
              <ModelPicker modelId={modelId} setModelId={setModelId} variant="compact" />
            </div>

            {/* Chat / Build segmented toggle — controls whether the AI executes in Studio */}
            <div
              className="ml-1 inline-flex overflow-hidden rounded-lg border text-[11px] font-bold"
              style={{ borderColor: "var(--bs-border)" }}
              title="Chat = brainstorm only · Build = create in Roblox Studio"
            >
              <button
                type="button"
                onClick={() => setMode("chat")}
                className="px-2.5 py-1.5"
                style={{
                  background: mode === "chat" ? "var(--bs-primary)" : "transparent",
                  color: mode === "chat" ? "white" : "var(--bs-muted-fg)",
                }}
              >
                <MessageSquare className="mr-1 inline h-3 w-3" />
                {t("chat.modeChat")}
              </button>
              <button
                type="button"
                onClick={() => setMode("build")}
                className="px-2.5 py-1.5"
                style={{
                  background: mode === "build" ? "var(--bs-primary)" : "transparent",
                  color: mode === "build" ? "white" : "var(--bs-muted-fg)",
                }}
              >
                <Wrench className="mr-1 inline h-3 w-3" />
                {t("chat.modeBuild")}
              </button>
            </div>

            {/* Auto-execute toggle — when off, Build mode drafts a plan instead of running */}
            {mode === "build" && (
              <label
                className="ml-1 inline-flex select-none items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-bold"
                style={{
                  borderColor: autoExecute ? "color-mix(in oklab, var(--bs-primary) 50%, transparent)" : "var(--bs-border)",
                  background: autoExecute ? "color-mix(in oklab, var(--bs-primary) 10%, transparent)" : "transparent",
                  color: autoExecute ? "var(--bs-primary)" : "var(--bs-muted-fg)",
                  cursor: "pointer",
                }}
                title={autoExecute
                  ? "Auto-execute ON � builds run in Roblox Studio immediately. Uncheck to plan first and push manually."
                  : t("chat.autoExecuteHint")}
              >
                <input
                  type="checkbox"
                  checked={!!autoExecute}
                  onChange={(e) => setAutoExecute(e.target.checked)}
                  className="h-3 w-3 accent-indigo-500"
                />
                <Zap className="h-3 w-3" style={{ color: autoExecute ? "var(--bs-primary)" : "var(--bs-muted-fg)" }} />
                <span className="hidden md:inline">{t("chat.autoExecute")}</span>
              </label>
            )}

            {/* Push to Studio — runs the last drafted plan as real Roblox actions */}
            <button
              type="button"
              onClick={onPushToStudio}
              disabled={busy}
              className="bs-quick"
              title={t("chat.pushStudio")}
              style={{ color: "var(--bs-primary)" }}
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t("chat.pushStudio")}</span>
            </button>

            {/* Queue control buttons — always visible */}
            <button
              type="button"
              onClick={onClearQueue}
              className="bs-quick"
              title="Stop the build and clear all queued actions for Roblox Studio"
            >
              <Square className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t("chat.stop")}</span>
            </button>
            <button
              type="button"
              onClick={onUndoLast}
              className="bs-quick"
              title="Cancel queued actions from your last build (use Ctrl+Z in Studio to revert applied ones)"
            >
              <Undo2 className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t("chat.undo")}</span>
            </button>

            {busy ? (
              <button onClick={onStop} className="bs-send-btn flex h-10 items-center gap-1.5 px-4 text-sm font-medium"
                style={{ background: "var(--bs-danger)", boxShadow: "none" }}>
                <X className="h-4 w-4" /> {t("chat.stop")}
              </button>
            ) : (
              <button onClick={onSubmit} disabled={!canSend}
                className="bs-send-btn flex h-10 items-center gap-1.5 px-4 text-sm font-medium"
                style={mode === "chat" ? { background: "color-mix(in oklab, var(--bs-primary) 70%, transparent)" } : undefined}>
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">{mode === "chat" ? t("common.send") : t("chat.modeBuild")}</span>
              </button>
            )}

          </div>
        </div>

        <div className="mt-2 flex items-center justify-between px-1 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
          <span>Enter to send · Shift+Enter for new line</span>
          <span className="hidden sm:inline">BloxSmith can make mistakes. Always test in Roblox Studio.</span>
        </div>
      </div>
    </div>
  );
}

/* ────────────────── HEALTH + TIMELINE HELPERS ────────────────── */
function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function actionStatusCounts(actions: any[] = []) {
  return actions.reduce(
    (acc, action) => {
      const status = String(action?.status ?? "pending");
      acc.total += 1;
      if (status === "done") acc.done += 1;
      else if (status === "failed") acc.failed += 1;
      else if (status === "sent") acc.sent += 1;
      else acc.pending += 1;
      return acc;
    },
    { total: 0, done: 0, failed: 0, sent: 0, pending: 0 },
  );
}

function getActionResult(action: any) {
  return action?.result && typeof action.result === "object" ? action.result : {};
}

function buildHealthReport(actions: any[] = [], pluginSession: any, pluginOnline: boolean) {
  const awareness = pluginSession?.last_scan?.awareness;
  const issues: string[] = Array.isArray(awareness?.issues) ? awareness.issues : [];
  const counts = actionStatusCounts(actions);
  const inserts = actions.filter((a) => a.kind === "insert_asset");
  const completedInserts = inserts.filter((a) => a.status === "done");
  const verifiedInserts = completedInserts.filter((a) => {
    const result = getActionResult(a);
    return result.verified === true || result.safety_status === "Working" || result.safety?.status === "Working";
  });
  const reviewInserts = completedInserts.filter((a) => {
    const result = getActionResult(a);
    return result.safety_status === "Needs Review" || result.safety?.status === "Needs Review";
  });
  const scanDone = actions.some((a) => a.kind === "scan_project" && a.status === "done") || !!pluginSession?.last_scan_at;
  const cleanupDone = actions.some((a) => (a.kind === "organize_project" || a.kind === "autofix_project") && a.status === "done");
  const scriptsDone = actions.some((a) => ["script", "localscript", "modulescript", "remoteevent", "remotefunction"].includes(a.kind) && a.status === "done");
  const uiDone = actions.some((a) => ["screengui", "gui", "frame", "textlabel", "textbutton", "imagelabel"].includes(a.kind) && a.status === "done");

  let score = 100;
  if (!pluginOnline) score -= 12;
  if (!scanDone) score -= 8;
  if (!cleanupDone && counts.total > 0) score -= 6;
  score -= Math.min(35, counts.failed * 10);
  score -= Math.min(30, issues.length * 5);
  score -= Math.min(18, reviewInserts.length * 6);
  if (counts.pending + counts.sent > 0) score -= 5;
  if (inserts.length > 0 && verifiedInserts.length === 0) score -= 10;

  const checks = [
    { label: "Plugin connected", ok: pluginOnline, detail: pluginOnline ? "Studio is online" : "Connect the Studio plugin" },
    { label: "Studio actions", ok: counts.total === 0 || counts.failed === 0, detail: counts.total ? `${counts.done}/${counts.total} completed` : "No actions yet" },
    { label: "Toolbox assets", ok: inserts.length === 0 || verifiedInserts.length > 0, detail: inserts.length ? `${verifiedInserts.length}/${inserts.length} verified` : "No assets inserted yet" },
    { label: "Safety scan", ok: reviewInserts.length === 0, detail: reviewInserts.length ? `${reviewInserts.length} need review` : "No risky imports detected" },
    { label: "Cleanup", ok: cleanupDone || counts.total === 0, detail: cleanupDone ? "Organize/auto-fix ran" : "Run Fix All after builds" },
    { label: "Workspace scan", ok: scanDone && issues.length === 0, detail: scanDone ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "No scan yet" },
    { label: "Scripts/remotes", ok: scriptsDone || counts.total === 0, detail: scriptsDone ? "Runtime systems queued" : "No scripts/remotes yet" },
    { label: "UI", ok: uiDone || counts.total === 0, detail: uiDone ? "UI actions queued" : "No UI built yet" },
  ];

  return {
    score: clampScore(score),
    issues: issues.slice(0, 8),
    counts,
    inserts,
    verifiedInserts,
    reviewInserts,
    scanDone,
    cleanupDone,
    checks,
  };
}

function timelineState(done: boolean, active: boolean, failed = false) {
  if (failed) return "failed";
  if (done) return "done";
  if (active) return "active";
  return "idle";
}

function buildExecutionTimeline(actions: any[] = [], busy = false) {
  const counts = actionStatusCounts(actions);
  const hasActions = counts.total > 0;
  const hasPending = counts.pending + counts.sent > 0;
  const hasFailed = counts.failed > 0;
  const insertRows = actions.filter((a) => a.kind === "insert_asset");
  const assetDone = insertRows.some((a) => a.status === "done");
  const safetyDone = insertRows.some((a) => {
    const result = getActionResult(a);
    return a.status === "done" && (result.safety || result.safety_status || result.verified !== undefined);
  });
  const cleanupDone = actions.some((a) => (a.kind === "organize_project" || a.kind === "autofix_project") && a.status === "done");
  const scanDone = actions.some((a) => a.kind === "scan_project" && a.status === "done");

  return [
    { label: "Plan", detail: busy ? "AI is planning the build" : hasActions ? "Plan created" : "Waiting for prompt", state: timelineState(hasActions, busy) },
    { label: "Queue", detail: hasActions ? `${counts.total} Studio action${counts.total === 1 ? "" : "s"}` : "No queued actions", state: timelineState(hasActions, busy && !hasActions) },
    { label: "Send", detail: hasPending ? `${counts.pending + counts.sent} waiting/running` : counts.done ? "Plugin received actions" : "Waiting", state: timelineState(counts.done > 0, hasPending, hasFailed && counts.done === 0) },
    { label: "Assets", detail: insertRows.length ? `${insertRows.filter((a) => a.status === "done").length}/${insertRows.length} inserted` : "No asset insert actions", state: timelineState(assetDone, hasPending && insertRows.length > 0) },
    { label: "Safety", detail: safetyDone ? "Toolbox imports verified" : "Awaiting asset result", state: timelineState(safetyDone, assetDone && !safetyDone) },
    { label: "Cleanup", detail: cleanupDone ? "Organize/auto-fix complete" : "Pending cleanup", state: timelineState(cleanupDone, hasPending) },
    { label: "Verify", detail: scanDone ? "Workspace scan complete" : "Run scan_project", state: timelineState(scanDone, cleanupDone && !scanDone, hasFailed) },
  ];
}

function healthTone(score: number) {
  if (score >= 90) return { label: "Excellent", color: "var(--bs-success)" };
  if (score >= 75) return { label: "Good", color: "#22c55e" };
  if (score >= 55) return { label: "Needs Work", color: "var(--bs-warning, #eab308)" };
  return { label: "Needs Fix", color: "var(--bs-danger, #ef4444)" };
}

/* ────────────────── RIGHT SIDEBAR ────────────────── */
function RightSidebar({
  project, pluginOnline, pluginSession, actions, buildPct, buildLabel, busy, onAction, onPrompt,
}: any) {
  const recent = (actions ?? []).slice(0, 6);
  const health = buildHealthReport(actions ?? [], pluginSession, pluginOnline);
  const tone = healthTone(health.score);
  const timeline = buildExecutionTimeline(actions ?? [], busy);
  const issues = health.issues;
  const lastScanAt = pluginSession?.last_scan_at ? new Date(pluginSession.last_scan_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <aside
      className="hidden w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l p-3 xl:flex"
      style={{ background: "var(--bs-card)", borderColor: "var(--bs-border)" }}
    >
      {/* Roblox Studio card */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: "var(--bs-grad)" }}>
            <Radio className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold">Roblox Studio</div>
            <div className="text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
              Plugin {pluginSession?.plugin_version || "v1.0"}
            </div>
          </div>
          <div className={`flex items-center gap-1 text-[11px] font-semibold ${pluginOnline ? "" : ""}`}
               style={{ color: pluginOnline ? "var(--bs-success)" : "var(--bs-muted-fg)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: pluginOnline ? "var(--bs-success)" : "var(--bs-muted-fg)" }} />
            {pluginOnline ? "Connected" : "Offline"}
          </div>
        </div>
        <div className="mt-2 text-xs" style={{ color: "var(--bs-muted-fg)" }}>
          Project: <span style={{ color: "var(--bs-fg)" }}>{project?.name ?? "—"}</span>
        </div>
        <Link to="/plugin" className="bs-send-btn mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium">
          {pluginOnline ? <><ExternalLink className="h-4 w-4" /> Open in Roblox Studio</> : <><RefreshCw className="h-4 w-4" /> Connect plugin</>}
        </Link>
        <Link
          to="/models/$projectId"
          params={{ projectId: project?.id ?? "" }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #8b5cf6, #3b82f6)" }}
        >
          <Box className="h-4 w-4" /> Generate 3D model
        </Link>
      </div>

      {/* Agent crew */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Agent Crew</div>
          <ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--bs-primary)" }} />
        </div>
        <div className="mt-3 grid gap-1.5">
          {AGENTS.map((agent) => {
            const Icon = agent.icon;
            return (
              <div key={agent.name} className="flex items-center gap-2 rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--bs-primary)" }} />
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-bold">{agent.name}</div>
                  <div className="truncate text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>{agent.job}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BloxSmith brain */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">BloxSmith Brain</div>
          <Cpu className="h-3.5 w-3.5" style={{ color: "var(--bs-primary)" }} />
        </div>
        <div className="mt-3 grid gap-1.5">
          {BRAIN_SYSTEMS.map((brain) => {
            const Icon = brain.icon;
            return (
              <div key={brain.name} className="flex items-start gap-2 rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--bs-primary)" }} />
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-bold">{brain.name} Brain</div>
                  <div className="text-[10px] leading-snug" style={{ color: "var(--bs-muted-fg)" }}>{brain.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Project health */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Project Health</div>
          <span className="text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>{lastScanAt ? `Scan ${lastScanAt}` : "No scan"}</span>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border text-xl font-black" style={{ borderColor: tone.color, color: tone.color, background: `color-mix(in oklab, ${tone.color} 12%, transparent)` }}>
            {health.score}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black" style={{ color: tone.color }}>{tone.label}</div>
            <div className="mt-1 text-[11px] leading-snug" style={{ color: "var(--bs-muted-fg)" }}>
              {health.counts.done}/{health.counts.total || 0} actions complete · {health.verifiedInserts.length}/{health.inserts.length || 0} assets verified
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--bs-card-2)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${health.score}%`, background: tone.color }} />
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {health.checks.slice(0, 6).map((check) => (
            <div key={check.label} className="rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
              <div className="flex items-center gap-1.5 text-[10px] font-bold">
                {check.ok ? <CheckCircle2 className="h-3 w-3" style={{ color: "var(--bs-success)" }} /> : <AlertCircle className="h-3 w-3" style={{ color: "var(--bs-warning)" }} />}
                <span className="truncate">{check.label}</span>
              </div>
              <div className="mt-0.5 truncate text-[9px]" style={{ color: "var(--bs-muted-fg)" }}>{check.detail}</div>
            </div>
          ))}
        </div>
        {issues.length === 0 ? (
          <p className="mt-2 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
            No scan issues shown. Run a scan after major builds to verify scripts, UI, assets, empty folders, mobile, and performance.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-[11px]">
            {issues.map((issue, i) => (
              <li key={`${issue}-${i}`} className="flex gap-1.5">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" style={{ color: "var(--bs-warning)" }} />
                <span className="min-w-0 break-words" style={{ color: "var(--bs-muted-fg)" }}>{issue.replace(/_/g, " ")}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onAction?.(COMPOSER_ACTIONS.find((a: any) => a.label === "Scan Game"))} className="bs-quick justify-center">
            <ScanLine className="h-3 w-3" /> Scan
          </button>
          <button type="button" onClick={() => onAction?.(COMPOSER_ACTIONS.find((a: any) => a.label === "Fix All"))} className="bs-quick justify-center" style={{ color: "var(--bs-warning)" }}>
            <Wrench className="h-3 w-3" /> Fix All
          </button>
        </div>
      </div>

      {/* Execution timeline */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Execution Timeline</div>
          <div className="text-sm font-bold" style={{ color: "var(--bs-primary)" }}>{busy ? `${buildPct}%` : "Idle"}</div>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bs-card-2)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: busy ? `${buildPct}%` : "100%", background: busy ? "var(--bs-grad)" : "color-mix(in oklab, var(--bs-success) 60%, transparent)" }} />
        </div>
        <div className="mt-2 text-xs" style={{ color: "var(--bs-muted-fg)" }}>{buildLabel}</div>
        <div className="mt-3 space-y-1.5">
          {timeline.map((step) => {
            const color = step.state === "done" ? "var(--bs-success)" : step.state === "failed" ? "var(--bs-danger)" : step.state === "active" ? "var(--bs-primary)" : "var(--bs-muted-fg)";
            return (
              <div key={step.label} className="flex items-center gap-2 rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}>
                  {step.state === "active" ? <Loader2 className="h-3 w-3 animate-spin" /> : step.state === "done" ? <CheckCircle2 className="h-3 w-3" /> : step.state === "failed" ? <AlertCircle className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-bold">{step.label}</div>
                  <div className="truncate text-[10px]" style={{ color: "var(--bs-muted-fg)" }}>{step.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Templates */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Game Templates</div>
          <LayoutDashboard className="h-3.5 w-3.5" style={{ color: "var(--bs-muted-fg)" }} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {GAME_TEMPLATES.slice(0, 10).map((template) => (
            <button key={template.label} type="button" onClick={() => onPrompt?.(template.prompt)} className="rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
              {template.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toolbox mode */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Toolbox Only Mode</div>
          <ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--bs-success)" }} />
        </div>
        <p className="mt-2 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
          Visual builds use safe free Creator Store assets first: real names, ids, clean placement, no procedural placeholder maps.
        </p>
        <button type="button" onClick={() => onAction?.(COMPOSER_ACTIONS.find((a: any) => a.label === "Toolbox Assets"))} className="bs-quick mt-3 w-full justify-center">
          <Box className="h-3 w-3" /> Add Toolbox Assets
        </button>
      </div>

      {/* Credit guide */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Credits Guide</div>
          <Zap className="h-3.5 w-3.5" style={{ color: "var(--bs-primary)" }} />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
          {CREDIT_GUIDE.map(([label, cost]) => (
            <div key={label} className="rounded-lg border px-1.5 py-1" style={{ borderColor: "var(--bs-border)", background: "var(--bs-card-2)" }}>
              <div className="truncate font-semibold">{label}</div>
              <div style={{ color: "var(--bs-muted-fg)" }}>{cost}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Actions */}
      <div className="bs-card rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Recent Actions</div>
          <BookOpen className="h-3.5 w-3.5" style={{ color: "var(--bs-muted-fg)" }} />
        </div>
        {recent.length === 0 ? (
          <p className="mt-2 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
            Actions generated by the AI will appear here, waiting for the Studio plugin to pick them up.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-xs">
            {recent.map((a: any) => (
              <li key={a.id} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{
                  background: a.status === "done" ? "var(--bs-success)" :
                              a.status === "failed" ? "var(--bs-danger)" :
                              a.status === "sent" ? "var(--bs-accent)" : "var(--bs-warning)",
                }} />
                <span className="flex-1 truncate">
                  <span className="opacity-70">{a.kind}</span> <span className="font-medium">{a.name}</span>
                  {a.kind === "insert_asset" && a.result?.safety_status && (
                    <span className="ml-1 rounded px-1 py-0.5 text-[9px] font-bold"
                      style={{
                        background: a.result.safety_status === "Working"
                          ? "color-mix(in oklab, var(--bs-success) 16%, transparent)"
                          : "color-mix(in oklab, var(--bs-warning) 16%, transparent)",
                        color: a.result.safety_status === "Working" ? "var(--bs-success)" : "var(--bs-warning)",
                      }}
                    >
                      {a.result.safety_status}
                    </span>
                  )}
                  {a.status === "failed" && a.error && (
                    <span className="ml-1 text-[10px]" style={{ color: "var(--bs-danger)" }}>
                      {String(a.error).slice(0, 50)}
                    </span>
                  )}
                </span>
                <span className="text-[10px] capitalize" style={{ color: "var(--bs-muted-fg)" }}>{a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/* ────────────────── MODEL PICKER (real models) ────────────────── */
function ModelPicker({
  modelId, setModelId, variant = "bar",
}: { modelId: string; setModelId: (id: string) => void; variant?: "bar" | "compact" }) {
  const [open, setOpen] = useState(false);
  const [modelHealth, setModelHealth] = useState<Record<string, any>>({});
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const load = () => {
      try {
        setModelHealth(JSON.parse(localStorage.getItem("bloxsmith-model-health-v2") || "{}"));
      } catch {
        setModelHealth({});
      }
    };
    load();
    window.addEventListener("storage", load);
    return () => window.removeEventListener("storage", load);
  }, []);

  const current = MODELS.find((m) => m.id === modelId) ?? MODELS[0];
  const currentHealth = modelHealth[current?.id ?? ""];

  const creditColor = (c: string) =>
    c === "Low" ? "#22c55e" : c === "Medium" ? "#eab308" : c === "High" ? "#f97316" : "#ef4444";
  const healthLabel = (health: any) => {
    if (!health || typeof health !== "object") return "Untested";
    return health.healthStatus ?? (health.ok ? "Working" : "Needs Fix");
  };
  const healthColor = (health: any) => {
    if (!health || typeof health !== "object") return "var(--bs-muted-fg)";
    const status = healthLabel(health);
    if (status === "Working") return "var(--bs-success)";
    if (status === "Slow") return "#eab308";
    if (status === "Partially Working") return "#f97316";
    if (status === "Not Working" || status === "Needs Fix") return "var(--bs-danger, #ef4444)";
    return "var(--bs-muted-fg)";
  };
  const selectModel = (m: (typeof MODELS)[number], health: any, disabled: boolean) => {
    if (disabled) return;
    const status = healthLabel(health);
    if (["Partially Working", "Not Working", "Slow", "Needs Fix"].includes(status)) {
      const ok = window.confirm(`${m.label} is marked "${status}" from the latest Roblox model scan. It may fail or produce weaker Roblox builds. Use it anyway?`);
      if (!ok) return;
    }
    setModelId(m.id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          variant === "bar"
            ? "bs-soft flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-left"
            : "bs-soft flex min-w-0 items-center gap-2 px-2.5 py-1.5 text-left max-w-[260px]"
        }
      >
        <Cpu className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--bs-muted-fg)" }} />
        {variant === "bar" && (
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>Model</span>
        )}
        <span className="truncate text-sm font-semibold" style={{ color: "var(--bs-fg)" }}>
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: healthColor(currentHealth) }} />
          {current?.label}
        </span>
        <span className="hidden sm:inline text-[10px] rounded-md px-1.5 py-0.5"
          style={{ background: "color-mix(in oklab, var(--bs-fg) 8%, transparent)", color: "var(--bs-muted-fg)" }}>
          {current?.provider}
        </span>
        {healthLabel(currentHealth) !== "Untested" && (
          <span className="hidden lg:inline text-[10px] rounded-md px-1.5 py-0.5"
            style={{ background: "color-mix(in oklab, var(--bs-fg) 8%, transparent)", color: healthColor(currentHealth) }}>
            {healthLabel(currentHealth)}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--bs-muted-fg)" }} />
      </button>

      {open && (
        <div
          className="scrollbar-thin absolute right-0 z-50 mt-1.5 max-h-[70vh] w-[360px] overflow-y-auto rounded-xl border p-1.5 shadow-2xl"
          style={{ background: "var(--bs-card)", borderColor: "var(--bs-border)", color: "var(--bs-fg)" }}
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--bs-muted-fg)" }}>
            Real models · via Quatarly / NVIDIA
          </div>
          <div className="px-2 pb-1 text-[11px]" style={{ color: "var(--bs-muted-fg)" }}>
            Automatic scans mark models as Working, Partially Working, Not Working, Slow, or Needs Fix. Risky models show a warning before selection.
          </div>
          {MODELS.map((m) => {
            const active = m.id === modelId;
            const disabled = m.status !== "Working";
            const health = modelHealth[m.id];
            const modelHealthColor = healthColor(health);
            const modelHealthLabel = healthLabel(health);
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => selectModel(m, health, disabled)}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={active
                  ? { background: "var(--bs-primary)", color: "var(--bs-primary-fg)" }
                  : {
                      color: "var(--bs-fg)",
                      boxShadow: `inset 3px 0 0 ${modelHealthColor}`,
                      background: `color-mix(in oklab, ${modelHealthColor} ${modelHealthLabel === "Untested" ? 0 : 5}%, transparent)`,
                    }}
                onMouseEnter={(e) => { if (!active && !disabled) (e.currentTarget as HTMLElement).style.background = "var(--bs-card-2)"; }}
                onMouseLeave={(e) => { if (!active && !disabled) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: active ? "var(--bs-primary-fg)" : modelHealthColor }} />
                    <span className="truncate font-semibold">{m.label}</span>
                    <span className="text-[10px] rounded-md px-1.5 py-0.5 shrink-0"
                      style={active
                        ? { background: "color-mix(in oklab, var(--bs-primary-fg) 22%, transparent)", color: "var(--bs-primary-fg)" }
                        : { background: "color-mix(in oklab, var(--bs-fg) 8%, transparent)", color: "var(--bs-muted-fg)" }}>
                      {m.provider}
                    </span>
                    {disabled && (
                      <span className="text-[10px] rounded-md px-1.5 py-0.5 shrink-0"
                        style={{ background: "color-mix(in oklab, #eab308 18%, transparent)", color: "#eab308" }}>
                        Coming Soon
                      </span>
                    )}
                    <span className="text-[10px] rounded-md px-1.5 py-0.5 shrink-0"
                      style={{
                        background: `color-mix(in oklab, ${modelHealthColor} 18%, transparent)`,
                        color: active ? "var(--bs-primary-fg)" : modelHealthColor,
                      }}
                    >
                      {modelHealthLabel}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px]"
                    style={active ? { color: "var(--bs-primary-fg)", opacity: 0.85 } : { color: "var(--bs-muted-fg)" }}>
                    {m.bestFor}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="rounded px-1.5 py-0.5"
                      style={{ background: "color-mix(in oklab, var(--bs-fg) 6%, transparent)", color: "var(--bs-muted-fg)" }}>
                      {m.speed}
                    </span>
                    <span className="rounded px-1.5 py-0.5"
                      style={{ background: "color-mix(in oklab, var(--bs-fg) 6%, transparent)", color: "var(--bs-muted-fg)" }}>
                      {m.quality}
                    </span>
                    <span className="rounded px-1.5 py-0.5 font-medium"
                      style={{ background: `color-mix(in oklab, ${creditColor(m.credits)} 18%, transparent)`, color: creditColor(m.credits) }}>
                      {m.credits} credits
                    </span>
                  </div>
                </div>
                {active && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ────────────────── IMPROVE PROMPT BUTTON ────────────────── */
function ImprovePromptButton({
  input, setInput, disabled,
}: { input: string; setInput: (v: string) => void; disabled: boolean }) {
  const improve = useServerFn(improvePrompt);
  const [busy, setBusy] = useState(false);
  async function run() {
    const text = input.trim();
    if (!text || busy || disabled) return;
    setBusy(true);
    try {
      const res: any = await improve({ data: { text } });
      if (res?.ok && res.text) setInput(res.text);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      className="bs-icon-btn"
      title={input.trim() ? "Improve this prompt with AI" : "Type a prompt first, then click to improve it"}
      onClick={run}
      disabled={busy || disabled || !input.trim()}
      style={busy ? { color: "var(--bs-primary)" } : undefined}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
    </button>
  );
}
