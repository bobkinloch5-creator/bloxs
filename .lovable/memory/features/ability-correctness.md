---
name: Ability + Particle correctness rules
description: BloxSmith prompt PLAYER ABILITY CORRECTNESS block (flight, aura, dash, VFX) plus E2/E3/E4 particle rules, natural-language humanoid VFX aliases, direct body-part Attachments, and per-element recipes. Keep in sync with src/lib/bloxsmith-prompt.ts.
type: feature
---
Location: src/lib/bloxsmith-prompt.ts, "PLAYER ABILITY CORRECTNESS" section (after script correctness rule 10), including subsections A–F and E2/E3/E4.

Covers:
- Direction math: camera basis or Humanoid.MoveDirection, never HRP.LookVector alone.
- Flight canonical pattern: LinearVelocity + AlignOrientation on HRP, RelativeTo=World, cleanup on toggle-off and CharacterAdded.
- Flame aura scaffold (C) with full ParticleEmitter properties + PointLight + looping Sound + FlameAura folder.
- **E2 PARTICLE EFFECT LIBRARY**: per-element recipes with verbatim Texture/Rate/Lifetime/Speed/SpreadAngle/Size/Transparency/Color/LightEmission/Acceleration/PointLight values for: flame, lightning/electric, magic/arcane, holy/divine, dark/shadow, ice/frost, wind, smoke, sparkles, glowing energy, explosion burst, muzzle flash, portal/teleport, trail (via Trail instance not ParticleEmitter), footstep dust. Natural phrases like "turn my character into flames", "make me on fire", and "surround my avatar with lightning" mean scripted humanoid VFX, not Toolbox asset insertion.
- **E3 Particle self-test**: Texture is real, Size+Transparency+Color all NumberSequence/ColorSequence with ≥2 keypoints, all timing/motion props set, parented to an Attachment whose direct parent is a BasePart (never a Folder/Model/ReplicatedStorage), Enabled or :Emit called, PointLight for auras, Sound for continuous, CharacterAdded rehook, stale prefixed instance cleanup.
- **E4 HUMANOID BODY-PART VFX**: map full-body flames / fire aura / flaming hands / feet / head / weapon / burning NPC and equivalent lightning/magic/smoke/ice effects to correct R15 parts with R6 fallbacks. Full-body flames attach emitters to HRP, torso, head, arms/hands, legs/feet; server-create replicated effects; reapply on respawn; cap total Rate; no damage unless requested.
- Verified particle asset IDs: fire 243660364, smoke 244514357, spark 241876428, sparkles 241876828, plus rbxasset://textures/particles/{fire,smoke,sparkles}_main.dds fallbacks.
