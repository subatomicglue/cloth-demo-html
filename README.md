# Cloth Simulation Demos

## What This Teaches

- Verlet integration with position-based constraints (structural + shear) for stable cloth.
- Fixed-step simulation: `maxSubstep` limits per-step size, `maxAccumulated` caps catch-up to avoid runaway bursts.
- Interactive controls: grab vertices, orbit camera on empty space, shift-drag wind, wheel/pinch zoom.
- Pluggable renderers: three.js, Canvas 2D, and raw WebGL share one physics core for broad device compatibility.
- UI-driven parameter changes (grid, size, gravity, wind, constraints) with live updates when safe.
- Toast notifications for renderer status and warnings.
- Visual aids: on-screen XYZ axes widget for orientation.

## Table of Contents (Local Files)

- [Unified Demo + Renderer Switcher](./index.html)

## Live Demo (GitHub Pages)

- [Unified Demo + Renderer Switcher](https://subatomicglue.github.io/cloth-demo-html/index.html)

## What This Demo Teaches

- **Verlet cloth physics:** A grid of particles is simulated using the Verlet integration method.  Verlet solvers use distance constraints for structural and shear stability, iterating to bring grid points within those constraint.
- **Simulation Stability:** The sim uses a maximum timestep size, if exceeded the simulation divides time into smaller increments. Plus a max accumulated lag cap.  This keeps behavior consistent across slow/fast frame rates.
- **Interactive picking:** Pointer rays grab nearby cloth vertices with a tolerant hit radius, making dragging feel intuitive.
- **Camera intuition:** Empty-space drags orbit the camera; scroll/pinch zoom changes distance, while the XYZ widget reinforces orientation.
- **Renderer abstraction:** A single cloth simulation drives three renderers (three.js, Canvas2D, raw WebGL) for broad device compatibility.
- **Status feedback:** Toast notifications surface renderer status/warnings without blocking interaction.

## Capabilities

- Renderer switching without changing the simulation code.
- Adjustable grid size, overall cloth size, solver iterations, gravity, and wind.
- Keyboard and mouse/touch interactions for grab, wind, orbit, and zoom.
