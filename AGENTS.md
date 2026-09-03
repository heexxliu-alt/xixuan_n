# Dreaming of the Sea — Agent Skill Routing

## Scope

This repository is a vanilla HTML / CSS / JS project. Do not migrate it to React,
initialize shadcn, or install React Bits Components/Blocks unless a later task
explicitly requests that work.

The project brief, `PROJECT_TRUTH_SPEC.md`, `SURFACE_DIVE_HANDOFF.md`, and
existing implementation decisions have highest priority. Skills provide
judgement and implementation guidance; they must not override locked visual,
content, interaction, or motion decisions.

## Skill routing and priority

1. **Project brief / existing decisions** — source of truth for Dreaming of the
   Sea's underwater world, editorial portfolio purpose, content IA, frozen
   Surface → Dive boundaries, and approved interactions.
2. **`frontend-design`** — PRIMARY DESIGN SKILL. Use for art direction,
   editorial composition, typography, hierarchy, spatial composition, whitespace,
   color relationships, static viewport quality, and avoiding generic AI web
   design. The installed source is Anthropic's official Skill.
3. **`ui-ux-pro-max`** — SECONDARY UX / INTERACTION REVIEW. Use for interaction
   quality, affordance, responsive behavior, accessibility, UX consistency,
   implementation QA, and whether an interaction is usable. It does not redefine
   the project's art direction.
4. **GSAP Skills** (`gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`,
   `gsap-plugins`, `gsap-performance`, and related installed GSAP Skills) —
   MOTION ENGINEERING. Use to implement or debug already-approved motion,
   sequencing, scroll choreography, lifecycle, performance, and reduced-motion
   behavior. GSAP does not decide which animations the page should add.

## Combination examples

- LTPO Reading composition: `frontend-design` PRIMARY → `ui-ux-pro-max` REVIEW.
- LTPO Reading ScrollTrigger implementation: `frontend-design` supplies design
  constraints → relevant GSAP Skill implements and verifies the motion.
- Living Cursor runtime bug: diagnose the runtime behavior first; use GSAP only
  when the implementation requires it. Do not redesign the cursor incidentally.

## Dreaming of the Sea constraints

- Preserve deep blue / blue-black underwater atmosphere, pale aqua information
  structure, warm-gold attention cues, low luminance, controlled local contrast,
  editorial typography, and meaning-led interaction.
- Do not automatically add gradient-heavy AI aesthetics, floating cards,
  glassmorphism, generic SaaS layouts, hover/bounce/tilt, random stagger,
  decorative parallax, meaningless 3D, or animation for animation's sake.
- Treat “Motion is layout extended through time” and “Interaction follows
  meaning” as implementation rules.

## React Bits boundary

React Bits Pro is not installed as an Agent Skill in this repository. If a future
task evaluates a React Bits primitive, treat it as a visual/motion reference and
assess vanilla portability, GSAP compatibility, implementation cost, and
performance before adapting anything. Do not install components or migrate the
project as a side effect.
