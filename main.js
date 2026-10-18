// entry point: builds the stage, loads the kitchen and runs the frame loop
import { setLoading, crawl, finishLoading } from './src/core/loading.js'; // (first: the loading screen is filled in as the rest gets ready)
import { renderer, scene, camera, controls, constrainCamera, adaptResolution, render, warmUp } from './src/core/stage.js';
import { loadKitchen } from './src/world/kitchen.js';
import { initIngredients } from './src/ingredients.js';
import { initBowl, updateBowl } from './src/bowl/index.js';
import { initMixer, updateMixer } from './src/mixer/index.js';
import { initRolling, updateRolling } from './src/rolling/index.js';
import { initCutting, updateCutting } from './src/cutting/index.js';
import { initBaking, updateBaking } from './src/baking/index.js';
import { initDecorating, updateDecorating } from './src/decorating/index.js';
import { addChristmas, updateChristmas } from './src/world/christmas.js';
import { initInteraction, updateInteraction } from './src/input/interaction.js';
import { trackProgress } from './src/core/progress.js';
import { updateLights } from './src/world/lights.js';
import { updateTweens } from './src/core/tween.js';
import { updateSequences } from './src/core/sequence.js';
import { initReflections, updateReflections } from './src/world/reflections.js';
import { initPhysics, stepPhysics } from './src/world/physics.js';
import { initDebris, updateDebris } from './src/world/debris.js';
import { initPendant, updatePendant } from './src/world/pendant.js';
import './src/ui.js';

const world = await loadKitchen( scene, camera, controls );
setLoading( 0.58 );
await initPhysics( world.room ); // the table, the bowl and the floor that things can fall on
setLoading( 0.64 );
initDebris( scene ); // what's left when something breaks
await initPendant( world.room ); // the lamp over the table swings when it's knocked
setLoading( 0.7 );
addChristmas( world.room, scene, camera ); // snow, frost, presents, a snowman...
initBowl( world, scene, camera ); // before the ingredients: restoring saved progress uses it
initIngredients( world );
trackProgress();
initMixer( { scene, room: world.room, camera, controls, canvas: renderer.domElement } ); // after the ingredients: it appears once they're all in
initRolling( { scene, room: world.room, camera, controls, canvas: renderer.domElement } ); // after the mixer: needs to know if the dough is mixed
initCutting( { room: world.room, camera, controls } ); // after rolling: cuts the rolled-out dough
initBaking( { room: world.room, camera, controls } ); // after cutting: bakes the cookies cut out
initDecorating( { room: world.room } ); // after baking: decorates the cookies that came out perfect
initInteraction( { camera, canvas: renderer.domElement, interactables: world.interactables } );
initReflections( world.room ); // the shiny ingredients reflect the kitchen

setLoading( 0.8 );
crawl( 0.97, 12 ); // (the GPU getting ready can't be measured: the bar creeps on meanwhile)
await warmUp(); // the GPU works out how to draw what's still hidden now, not in the middle of an animation

let lastTime = 0;

renderer.setAnimationLoop( ( time ) => {

	const t = time / 1000;
	adaptResolution( t - lastTime );
	const dt = Math.min( t - lastTime, 0.1 );
	lastTime = t;

	updateLights( t );
	updateChristmas( dt, t );
	constrainCamera();
	controls.update();
	updateInteraction( dt );
	stepPhysics( dt );
	updateDebris( dt );
	updatePendant( dt );
	updateTweens( dt );
	updateSequences( dt );
	updateBowl( dt );
	updateMixer( dt );
	updateRolling( dt );
	updateCutting( dt );
	updateBaking( dt );
	updateDecorating( dt );
	updateReflections( renderer, scene );
	render();

} );

finishLoading(); // (the loading screen fades out once the first picture is drawn)
