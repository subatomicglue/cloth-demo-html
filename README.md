# Cloth Simulation Demos

## What This Teaches

- Verlet integration with position-based constraints (structural + shear) for stable cloth.
- Fixed-step simulation: `maxSubstep` limits per-step size, `maxAccumulated` caps catch-up to avoid runaway bursts.
- Interactive controls: grab vertices, orbit camera on empty space, shift-drag wind, wheel/pinch zoom.
- Pluggable renderers: three.js, Canvas 2D, and raw WebGL share one physics core for broad device compatibility.
- UI-driven parameter changes (grid, size, gravity, wind, constraints) with live updates when safe.
- Toast notifications for renderer status and warnings.
- Visual aids: on-screen XYZ axes widget for orientation.

## Live Demo

- [Cloth Demo](https://subatomicglue.github.io/cloth-demo-html/index.html)

## View the Source

- [index.html](./index.html)

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


## HelloWorld Demos
To help you navigate, here's a complete list of my hello world demos

### Simple Demos
- 2D SVG - [helloworld_html_js_svg](https://github.com/subatomicglue/helloworld_html_js_svg)
- 2D Canvas - [helloworld_html_js_canvas](https://github.com/subatomicglue/helloworld_html_js_canvas)
- 3D Canvas - [threejs-helloworld-cube](https://github.com/subatomicglue/threejs-helloworld-cube)
- 2D Spline Curve through points - [helloworld-catmull-rom-spline-curve](https://github.com/subatomicglue/helloworld-catmull-rom-spline-curve)

### More Advanced Demos
- 2D Canvas with fractal tree - [fractaltree](https://github.com/subatomicglue/fractaltree)
- 2D Canvas with sprites and map tiles - [sprite_demo_js](https://github.com/subatomicglue/sprite_demo_js)
- Cloth Simulation - [cloth-demo-html](https://github.com/subatomicglue/cloth-demo-html)
- Audio Demo with drummachine - [drummachine](https://github.com/subatomicglue/drummachine)
- Audio Demos:  MIDI music, Audio player - [drummachine](https://github.com/subatomicglue/kiosk)
- Peer to Peer chat using WebRTC - [helloworld_html_js_webrtc_p2p](https://github.com/subatomicglue/helloworld_html_js_webrtc_p2p)
