---
name: Ability script correctness rules
description: BloxSmith prompt contains PLAYER ABILITY CORRECTNESS block (flight, aura, dash, VFX) with canonical LinearVelocity+AlignOrientation flight, camera-relative direction math, and full ParticleEmitter scaffold. Keep in sync with src/lib/bloxsmith-prompt.ts.
type: feature
---
Location: src/lib/bloxsmith-prompt.ts, "PLAYER ABILITY CORRECTNESS" section (after script correctness rule 10).

Covers:
- Direction math: camera basis or Humanoid.MoveDirection, never HRP.LookVector alone (fixes "flew backwards").
- Flight canonical pattern: LinearVelocity + AlignOrientation on HRP, PlatformStand toggled, RelativeTo=World, cleanup on toggle-off and CharacterAdded.
- Flame aura / VFX: full ParticleEmitter properties (Size/Transparency/Color sequences, LightEmission, Acceleration, EmissionDirection), PointLight for visibility, looping fire sound, folder-wrapped for easy removal.
- Universal ability self-test: CharacterAdded rehook, cleanup old instances, camera-relative direction, non-zero MaxForce/Torque, all VFX sequences set, gameProcessedEvent guard, task.wait only, nil-safe access.
- Verified particle asset IDs to prefer: 243660364 (fire), 244514357 (smoke), 241876428 (spark), 241876828 (sparkles), and rbxasset://textures/particles/fire_main.dds fallback.
