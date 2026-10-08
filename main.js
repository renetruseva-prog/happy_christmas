// entry point: builds the stage, loads the kitchen and runs the frame loop
import { renderer, scene, camera, controls, constrainCamera, render } from './src/stage.js';
import { loadKitchen } from './src/kitchen.js';
import { initIngredients } from './src/ingredients.js';
import { initBowl, updateBowl } from './src/bowl/index.js';
import { initMixer, updateMixer } from './src/mixer/index.js';
import { initRolling, updateRolling } from './src/rolling/index.js';
import { initCutting, updateCutting } from './src/cutting/index.js';
import { initBaking, updateBaking } from './src/baking/index.js';
import { initInteraction, updateInteraction } from './src/interaction.js';
import { trackProgress } from './src/progress.js';
import { updateLights } from './src/lights.js';
import { updateTweens } from './src/tween.js';
import { updateSequences } from './src/sequence.js';
import './src/ui.js';

const world = await loadKitchen( scene, camera, controls );
initBowl( world, scene, camera ); // before the ingredients: restoring saved progress uses it
initIngredients( world );
trackProgress();
initMixer( { scene, room: world.room, camera, controls, canvas: renderer.domElement } ); // after the ingredients: it appears once they're all in
initRolling( { scene, room: world.room, camera, controls, canvas: renderer.domElement } ); // after the mixer: needs to know if the dough is mixed
initCutting( { room: world.room, camera, controls } ); // after rolling: cuts the rolled-out dough
initBaking( { room: world.room, camera, controls } ); // after cutting: bakes the cookies cut out
initInteraction( { camera, canvas: renderer.domElement, interactables: world.interactables } );

let lastTime = 0;

renderer.setAnimationLoop( ( time ) => {

	const t = time / 1000;
	const dt = Math.min( t - lastTime, 0.1 );
	lastTime = t;

	updateLights( t );
	constrainCamera();
	controls.update();
	updateInteraction( dt );
	updateTweens( dt );
	updateSequences( dt );
	updateBowl( dt );
	updateMixer( dt );
	updateRolling( dt );
	updateCutting( dt );
	updateBaking( dt );
	render();

} );
