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
- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) for the optional hand tracking
- [Vite](https://vite.dev/)
- A kitchen modelled in Blender, with the lighting baked into its textures (`public/models/kitchen.glb`)
- Most other things are made in code: the hand mixer, the rolling pin, the cookies, the piping bag's icing, the snow and the Christmas decorations, plus the physics for the dough, the icing, the falling chips and sprinkles, and the walking and collisions.

## Project layout

```
main.js            starts everything and runs the frame loop
src/shaders/       the two ported Shadertoy shaders
src/bowl/          the ingredients, and the dough's soft body
src/mixer/         the hand mixer      src/rolling/   rolling the dough
src/cutting/       cutting the cookies
src/baking/        the oven, knob, flames, smoke, alarm and the hand
src/decorating/    icing, chips, sprinkles and the Christmas card
```
