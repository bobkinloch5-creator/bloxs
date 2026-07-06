---
name: Ability + Particle correctness rules
description: BloxSmith prompt PLAYER ABILITY CORRECTNESS block (flight, aura, dash, VFX) plus E2 PARTICLE EFFECT LIBRARY with per-element recipes (flame/lightning/magic/holy/dark/ice/wind/smoke/sparkles/glow/explosion/muzzle/portal/trail/footstep) and E3 particle self-test. Keep in sync with src/lib/bloxsmith-prompt.ts.
type: feature
---
Location: src/lib/bloxsmith-prompt.ts, "PLAYER ABILITY CORRECTNESS" section (after script correctness rule 10), including subsections A–F and E2/E3.

Covers:
- Direction math: camera basis or Humanoid.MoveDirection, never HRP.LookVector alone.
- Flight canonical pattern: LinearVelocity + AlignOrientation on HRP, RelativeTo=World, cleanup on toggle-off and CharacterAdded.
- Flame aura scaffold (C) with full ParticleEmitter properties + PointLight + looping Sound + FlameAura folder.
- **E2 PARTICLE EFFECT LIBRARY**: per-element recipes with verbatim Texture/Rate/Lifetime/Speed/SpreadAngle/Size/Transparency/Color/LightEmission/Acceleration/PointLight values for: flame, lightning/electric, magic/arcane, holy/divine, dark/shadow, ice/frost, wind, smoke, sparkles, glowing energy, explosion burst, muzzle flash, portal/teleport, trail (via Trail instance not ParticleEmitter), footstep dust. Includes canonical toggleable aura scaffold with PRESET table.
- **E3 Particle self-test**: Texture is real, Size+Transparency+Color all NumberSequence/ColorSequence with ≥2 keypoints, all timing/motion props set, parented to Attachment in a Part, Enabled or :Emit called, PointLight for auras, Sound for continuous, CharacterAdded rehook, wrapped in named Folder.
- Verified particle asset IDs: fire 243660364, smoke 244514357, spark 241876428, sparkles 241876828, plus rbxasset://textures/particles/{fire,smoke,sparkles}_main.dds fallbacks.
