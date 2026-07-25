// BloxSmith AI Asset Generator catalog
// ---------------------------------------------------------------------------
// Presets that turn a short user idea into a well-formed image prompt plus the
// correct output dimensions for each Roblox asset slot.

export type AssetKind =
  | "icon"
  | "button"
  | "logo"
  | "loading_screen"
  | "ui_background"
  | "item_thumbnail"
  | "npc_portrait"
  | "low_poly_texture"
  | "stylized_texture"
  | "promo_art"
  | "game_thumbnail"
  | "game_icon";

export type AssetStyle = "neon" | "cartoon" | "realistic" | "low_poly" | "pixel" | "anime";

export type AssetPreset = {
  kind: AssetKind;
  label: string;
  width: number;
  height: number;
  usage: string;
  promptTemplate: string;
  negative: string;
  transparent: boolean;
};

const SHARED_NEGATIVE =
  "blurry, watermark, signature, jpeg artifacts, text errors, extra limbs, distorted proportions, low resolution";

export const ASSET_PRESETS: Record<AssetKind, AssetPreset> = {
  icon: {
    kind: "icon",
    label: "UI Icon",
    width: 512,
    height: 512,
    usage: "ImageLabel / ImageButton inside generated UI",
    promptTemplate:
      "A single centered {subject} game UI icon, {style} style, bold silhouette, thick clean outline, vibrant saturated colors, soft inner glow, flat background, centered composition, mobile game icon art",
    negative: SHARED_NEGATIVE + ", cluttered background, multiple objects",
    transparent: true,
  },
  button: {
    kind: "button",
    label: "Button Skin",
    width: 512,
    height: 192,
    usage: "TextButton background image",
    promptTemplate:
      "A horizontal {style} game UI button plate for {subject}, rounded rectangle, glossy bevelled edge, subtle gradient, inner highlight, empty center for text, mobile game UI kit asset",
    negative: SHARED_NEGATIVE + ", text, letters, words",
    transparent: true,
  },
  logo: {
    kind: "logo",
    label: "Game Logo",
    width: 1024,
    height: 512,
    usage: "Main menu title art",
    promptTemplate:
      "A bold {style} video game logo emblem for a game called {subject}, chunky 3D lettering feel, dramatic outline, glowing accents, centered, transparent background, esports quality logo art",
    negative: SHARED_NEGATIVE + ", misspelled text, busy background",
    transparent: true,
  },
  loading_screen: {
    kind: "loading_screen",
    label: "Loading Screen",
    width: 1920,
    height: 1080,
    usage: "Full screen ImageLabel behind the loading bar",
    promptTemplate:
      "A cinematic {style} splash art of {subject}, wide establishing shot, dramatic rim lighting, atmospheric depth, empty space in the lower third for a progress bar, game loading screen key art",
    negative: SHARED_NEGATIVE + ", text, UI elements, borders",
    transparent: false,
  },
  ui_background: {
    kind: "ui_background",
    label: "UI Background",
    width: 1024,
    height: 1024,
    usage: "Panel background for menus and shops",
    promptTemplate:
      "A subtle {style} UI panel background texture themed around {subject}, soft vignette, low contrast so text stays readable, seamless gradient, game menu backdrop",
    negative: SHARED_NEGATIVE + ", text, characters, high contrast focal point",
    transparent: false,
  },
  item_thumbnail: {
    kind: "item_thumbnail",
    label: "Item Thumbnail",
    width: 512,
    height: 512,
    usage: "Inventory and shop slot artwork",
    promptTemplate:
      "A {style} game item render of {subject}, three quarter view, floating on a soft radial gradient, rim light, crisp edges, inventory thumbnail, collectible card art",
    negative: SHARED_NEGATIVE + ", background scenery, hands, text",
    transparent: true,
  },
  npc_portrait: {
    kind: "npc_portrait",
    label: "NPC Portrait",
    width: 768,
    height: 768,
    usage: "Dialogue panel speaker portrait",
    promptTemplate:
      "A {style} character portrait of {subject}, head and shoulders, friendly expressive face, dramatic key light, simple vignette background, game dialogue portrait",
    negative: SHARED_NEGATIVE + ", full body, text, multiple characters",
    transparent: true,
  },
  low_poly_texture: {
    kind: "low_poly_texture",
    label: "Low Poly Texture",
    width: 1024,
    height: 1024,
    usage: "SurfaceAppearance / Texture on parts",
    promptTemplate:
      "A seamless tileable low poly {subject} texture, flat faceted shading, limited palette, no shadows baked in, top down orthographic, game material tile",
    negative: SHARED_NEGATIVE + ", perspective, objects, text, seams",
    transparent: false,
  },
  stylized_texture: {
    kind: "stylized_texture",
    label: "Stylized Texture",
    width: 1024,
    height: 1024,
    usage: "SurfaceAppearance / Texture on parts",
    promptTemplate:
      "A seamless tileable hand painted stylized {subject} texture, painterly brush strokes, rich color variation, even lighting, orthographic, PBR albedo map",
    negative: SHARED_NEGATIVE + ", perspective, hard shadows, seams, text",
    transparent: false,
  },
  promo_art: {
    kind: "promo_art",
    label: "Promotional Artwork",
    width: 1600,
    height: 900,
    usage: "Social posts and store banners",
    promptTemplate:
      "Dynamic promotional key art for a Roblox game about {subject}, {style} style, action pose, dramatic lighting, strong focal character, cinematic composition, marketing banner",
    negative: SHARED_NEGATIVE + ", text, logos, borders",
    transparent: false,
  },
  game_thumbnail: {
    kind: "game_thumbnail",
    label: "Game Thumbnail",
    width: 1280,
    height: 720,
    usage: "Roblox experience thumbnail (16:9)",
    promptTemplate:
      "An eye catching Roblox game thumbnail for {subject}, {style} style, oversized expressive character in the foreground, punchy saturated colors, high contrast, clean readable silhouette, thumbnail art",
    negative: SHARED_NEGATIVE + ", small details, muddy colors, text",
    transparent: false,
  },
  game_icon: {
    kind: "game_icon",
    label: "Game Icon",
    width: 512,
    height: 512,
    usage: "Roblox experience icon (1:1)",
    promptTemplate:
      "A square Roblox experience icon for {subject}, {style} style, one bold centered subject, extreme readability at small size, thick outline, vivid background, app icon art",
    negative: SHARED_NEGATIVE + ", text, thin lines, busy composition",
    transparent: false,
  },
};

export const STYLE_MODIFIERS: Record<AssetStyle, string> = {
  neon: "neon cyberpunk, glowing edges, deep blue and magenta palette",
  cartoon: "bright cartoon, thick outlines, playful shapes",
  realistic: "semi realistic rendered, detailed materials, soft global illumination",
  low_poly: "low poly, faceted geometry, flat shading",
  pixel: "crisp pixel art, limited palette, clean dithering",
  anime: "anime cel shaded, expressive lines, vibrant highlights",
};

export type AssetRequest = {
  kind: AssetKind;
  subject: string;
  style?: AssetStyle;
  extra?: string;
};

export type CompiledAssetPrompt = {
  kind: AssetKind;
  label: string;
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  transparent: boolean;
  usage: string;
};

export function compileAssetPrompt(request: AssetRequest): CompiledAssetPrompt {
  const preset = ASSET_PRESETS[request.kind] ?? ASSET_PRESETS.icon;
  const style = STYLE_MODIFIERS[request.style ?? "cartoon"];
  const subject = request.subject.trim() || "a fantasy adventure game";
  const prompt = [
    preset.promptTemplate.replace(/\{subject\}/g, subject).replace(/\{style\}/g, style),
    request.extra?.trim(),
    preset.transparent ? "transparent background, alpha cutout" : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    kind: preset.kind,
    label: preset.label,
    prompt,
    negativePrompt: preset.negative,
    width: preset.width,
    height: preset.height,
    transparent: preset.transparent,
    usage: preset.usage,
  };
}

/** The default asset set a full game build should produce. */
export function defaultAssetPlan(gameTitle: string, theme: string, style: AssetStyle = "cartoon"): CompiledAssetPrompt[] {
  const requests: AssetRequest[] = [
    { kind: "game_icon", subject: gameTitle, style },
    { kind: "game_thumbnail", subject: `${gameTitle}, ${theme}`, style },
    { kind: "logo", subject: gameTitle, style },
    { kind: "loading_screen", subject: theme, style },
    { kind: "ui_background", subject: theme, style },
    { kind: "icon", subject: "coin currency", style },
    { kind: "icon", subject: "inventory backpack", style },
    { kind: "icon", subject: "shop cart", style },
    { kind: "icon", subject: "settings gear", style },
    { kind: "button", subject: "primary action", style },
  ];
  return requests.map(compileAssetPrompt);
}

/** Lua that swaps a generated image into the right UI element once uploaded. */
export function buildAssetBindingLua(bindings: Array<{ guiPath: string; assetId: string }>): string {
  const lines = [
    "-- Applies uploaded BloxSmith asset ids to the generated UI.",
    "-- Replace the ids with your own uploads if you re-upload the images.",
    "local function setImage(path, assetId)",
    "\tlocal current = game",
    '\tfor segment in path:gmatch("[^%.]+") do',
    "\t\tcurrent = current and current:FindFirstChild(segment)",
    "\tend",
    '\tif current and (current:IsA("ImageLabel") or current:IsA("ImageButton")) then',
    "\t\tcurrent.Image = assetId",
    "\telse",
    '\t\twarn(("[BloxSmith] Image target not found: %s"):format(path))',
    "\tend",
    "end",
    "",
  ];
  for (const binding of bindings) {
    const path = binding.guiPath.replace(/"/g, '\\"');
    const asset = binding.assetId.replace(/"/g, '\\"');
    lines.push(`setImage("${path}", "${asset}")`);
  }
  return lines.join("\n");
}
