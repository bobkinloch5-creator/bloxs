---
name: Premium UI Law
description: BloxSmith prompt requires every GUI, loading screen, and main menu to ship a polished AAA-quality design — no Roblox defaults, no flat backgrounds, mandatory theme table + layered background + hover/entrance motion + Gotham typography + responsive constraints.
type: feature
---

Location: `src/lib/bloxsmith-prompt.ts` — "PREMIUM GUI / LOADING SCREEN / MAIN MENU LAW" + "PREMIUM UI QUALITY BAR" block (~line 1206).

Applies to EVERY UI surface (not just full systems): ScreenGui, HUD, loading screen, splash, title screen, main menu, pause menu, settings, shop, inventory, quest log, notification, modal, even single buttons.

Non-negotiable requirements per surface:
- Named local Theme table (bg, surface, surface2, primary, primaryGlow, success, warning, danger, text, muted, stroke) matched to game genre.
- Layered background: 3+ stop UIGradient, optional hero image, vignette, ambient accents. Never a flat single color.
- UICorner + UIStroke + UIPadding on every container; UIListLayout/UIGridLayout instead of manual offsets.
- Soft drop-shadow (duplicate blurred Frame offset y+4-8) behind primary CTAs.
- Entrance tween on ScreenGui load: fade + slide + staggered cascade for lists.
- Hover tween: position shift + UIStroke brighten + BackgroundTransparency drop, 0.18s Quad Out.
- Press tween: Scale 0.97 bounce.
- Gotham typography: Black/Bold titles 48–110px, Semibold buttons 18–24px, Medium body 16–18px, Gotham captions 14px.
- Responsive: UIScale, UISizeConstraint on modals, UIAspectRatioConstraint on icons/square buttons, 44px+ touch targets, safe-area insets.
- Multi-surface builds spawn a shared `ReplicatedStorage.UIKit` ModuleScript with corner/stroke/gradient/padding/button/panel/tween/shadow helpers and the theme table.
- Self-check before emit: layered background + gradient + shadow + hover motion + on-brand palette + polished typography — if any missing, keep building.

Do not weaken this block. Do not re-add the old "only for explicitly requested full UI systems" gate.
