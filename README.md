# ForestCraft — Survival (game-3D)

ForestCraft is a lightweight browser-based 3D survival/demo game built with Three.js. Explore a low-poly forest, collect resources (wood, stone, berries, mushrooms), craft tools and campfires, and survive day/night cycles with roaming wolves at night.

This repository contains a single-page web game (index.html) with JavaScript game logic (script.js) and styling (style.css).

---

## Demo
Open `index.html` in a modern browser. For the best experience run a local static server (instructions below) so pointer-lock, audio, and other browser features behave correctly.

---

## Features
- 3D world using Three.js (r128 via CDN)
- Procedurally placed trees, rocks, berry bushes, mushrooms, water and grass
- Player with third-person camera, movement, sprinting, jumping
- Resource collection with respawn, inventory, and hotbar UI
- Crafting system (axe, campfire, shelter)
- Campfire placement, light and warmth effects
- Day/night cycle with changing sky, fog and enemy activation at night
- Simple enemy AI (wolves): wander, chase, attack. Wolves avoid campfires.
- Web Audio API tones for SFX (collect, craft, chop, hurt, step)
- Responsive HUD, inventory, crafting, pause and game over screens

---

## Controls
- Movement: W A S D or Arrow keys
- Sprint: Shift
- Jump: Space
- Look: Mouse (requires clicking the canvas to lock pointer)
- Interact / Collect / Place: E
- Inventory: I
- Crafting: C
- Quick eat: F (or double-click food in inventory)
- Pause: Esc
- Touch support: basic touch input is present

---

## Items & Crafting
Items (examples in code): wood, stone, berry, mushroom, stone axe, campfire, shelter.

Recipes (defined in `script.js`):
- Stone Axe — cost: wood x2 + stone x3 (faster tree chopping)
- Campfire — cost: wood x4 (warmth & energy regen; placeable)
- Shelter — cost: wood x8 + stone x4 (sleep through dangers)

You can view/modify items and recipes in `script.js` (ITEMS and RECIPES constants).

---

## Running locally (recommended)
To ensure pointer lock, audio and other APIs work consistently, serve the folder with a simple static server.

Python 3:
```bash
# from the repository root
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
