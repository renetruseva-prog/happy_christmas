# Cookie Baking Simulator

This game/simulator is supposed to imitate a Christmas kitchen in the browser, built with three.js and the `WebGPURenderer`. The player can mix the dough, roll it out, cut out the cookies into different shapes, bake them, decorate them and send a Christmas card to someone.

## The Shadertoy shaders I used

I used two shadertoy shaders for this project (flames and smoke) and both are written in three.js's node shading language (TSL), which compiles to WGSL for WebGPU. The structure of the original code is kept, and the added parts are marked in the source.

1. The flames at the back of the oven and this is the original URL: https://www.shadertoy.com/view/3tcBzH | [`src/shaders/fire.js`](src/shaders/fire.js) |

2. The smoke is shown only when the cookies are burnt ("overcooked") and this is the original URL: https://www.shadertoy.com/view/MsdGWn | [`src/shaders/smoke.js`](src/shaders/smoke.js) |

**How they respond to the player**
- **Flames:** they lean towards the mouse and reach up under it. The oven's knob (150°-250°) changes how big, fast and busy they are, so they're calm at 170° and "wilder" at 250°. Opening the oven door makes them flare.
- **Smoke:** it thickens as the cookies burn, and the player can wave the mouse over it to push it away and clear it. The smoke alarm goes off until it's cleared.

The simplex noise inside the smoke shader is Ian McEwan / Ashima Arts' [webgl-noise](https://github.com/ashima/webgl-noise) (MIT License). 

## How the project covers the brief

### Interactions

The whole game is hands-on: carry ingredients over the bowl and let go, hold the mouse button and stir in circles with the hand mixer, roll the dough with the pin, trace cutters or draw your own cookie shape, drag the tray into the oven, turn the knob, pipe icing and shake chips and sprinkles over the cookies. Mixing can also be done with your own hand through the webcam (MediaPipe hand tracking, smoothed so a missed frame doesn't stop the mixing). Dough that flies out of the bowl can be picked up and dragged off the table.

### Physics

Rigid bodies run on [Rapier](https://rapier.rs/) (`@dimforge/rapier3d-compat`), stepped at a fixed 60 Hz from the frame loop ([`src/physics.js`](src/physics.js)). The table, the bowl (its real mesh shape) and the floor are fixed colliders, with invisible walls round the table's edge.
- **Dropped ingredients** tumble on the table before returning to their spot. Eggs and the sugar jar **break** if they hit it hard: shards fly out ([`src/debris.js`](src/debris.js)), "Ouch! Try again." shows and a fresh one appears on the shelf.
- **Mixing:** the harder and faster you circle, the more dough the beaters fling out of the bowl ([`src/mixer/splatter.js`](src/mixer/splatter.js)). The blobs bounce off the bowl and land on the table, where you can drag them off.
- The dough's surface itself is a hand-written soft-body (springs and waves, [`src/bowl/doughBody.js`](src/bowl/doughBody.js)), and the falling chips and sprinkles use a small custom simulation ([`src/decorating/pieces.js`](src/decorating/pieces.js)), since Rapier has no soft bodies.

### Additional WebGPU libraries
The game runs on three.js's `WebGPURenderer` and uses its WebGPU-only parts: TSL node materials ([`three/tsl`](https://threejs.org/docs/#api/en/nodes/Nodes)) and the `BloomNode` post-processing addon for the glow of the lights, candles and oven. Next to that it uses [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) (hand tracking, GPU delegate) and Rapier (WebAssembly, on the CPU, not WebGPU). I was thinking of adding TSL compute particles and the ambient-occlusion and depth-of-field nodes, but for this specific simulation they weren't necessary.

### My own Blender models, including baking

The kitchen, the ingredients, the props and the oven were modelled in Blender and exported as one glTF file (`public/models/kitchen.glb`). The furniture and the walls have their lighting **baked** into textures, which the game shows unlit and brightens back up. Everything that moves (the ingredients, the oven door, the props) is left unbaked and lit in real time, with a shadow catcher on the table so they still cast shadows.

### Controlling animations from a Blender model

Two animation clips were keyframed in Blender and are played from the game:
- **`oven_door_open`** ([`public/models/oven_door.glb`](public/models/oven_door.glb)) swings the oven door on its hinge. The code scrubs the clip's time, so it opens and closes with the tray and stays in step with the flames and smoke ([`src/baking/oven.js`](src/baking/oven.js)).
- **`pendant_swing`** ([`public/models/pendant_swing.glb`](public/models/pendant_swing.glb)) swings the lamp over the table, with its light and shadows, whenever an egg or the sugar jar breaks into a surface that's not the table ([`src/pendant.js`](src/pendant.js)).

The clips are exported on their own (not inside the kitchen file), so the baked kitchen doesn't have to be re-exported when an animation changes. If a clip can't load, the oven door falls back to a code-driven swing.

## What you can do

1. **Pour in the ingredients.** Pick up the flour, sugar, eggs and butter and drop them in the bowl.
2. **Mix.** Stir with the hand mixer (or with your own hand in front of the webcam). The dough moves and deforms with a soft-body simulation.
3. **Roll the dough** out with the rolling pin.
4. **Cut cookies.** Use one of three star cutters or draw your own shape with the mouse.
5. **Carry the cookies to the tray** by hand, walking around the kitchen with the arrow keys.
6. **Bake.** Drag the tray into the oven, set the temperature with the knob, and take the cookies out in time: about 40 seconds at 180° is perfect. Underbaked and burnt batches have to be baked again.
7. **Decorate** the perfect ones with the piping bag, chocolate chips and sprinkles. The icing flows, and the chips and sprinkles fall and bounce.
8. **Share the love.** Turn your decorated cookies into a Christmas card with a message on the back (up to 150 characters), and share or download it.

## Run it

You need a browser with WebGPU (recent Chrome, Edge or Safari).

```bash
npm install
npm run dev      # development server
npm run build    # the production build goes in dist/
```

The webcam mixing mode is optional. It loads MediaPipe's hand-tracking files from the internet when it's switched on.

## Built with

- [three.js](https://threejs.org/) 0.186 (`WebGPURenderer`, TSL node materials, bloom and AgX tone mapping)
- [Rapier](https://rapier.rs/) for the rigid-body physics
- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) for the optional hand tracking
- [Vite](https://vite.dev/)
- A kitchen modelled in Blender, with the lighting baked into its textures (`public/models/kitchen.glb`)
- Most other things are made in code: the hand mixer, the rolling pin, the cookies, the piping bag's icing, the snow and the Christmas decorations, plus the physics for the dough, the icing, the falling chips and sprinkles, and the walking and collisions.

## Project layout

```
main.js            starts everything and runs the frame loop
src/physics.js     the Rapier world      src/debris.js   broken eggs and jars
src/pendant.js     the swinging lamp (Blender clip)
src/shaders/       the two ported Shadertoy shaders
src/bowl/          the ingredients, and the dough's soft body
src/mixer/         the hand mixer      src/rolling/   rolling the dough
src/cutting/       cutting the cookies
src/baking/        the oven, knob, flames, smoke, alarm and the hand
src/decorating/    icing, chips, sprinkles and the Christmas card
```
