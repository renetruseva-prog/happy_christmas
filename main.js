// entry point: builds the stage, loads the kitchen and runs the frame loop
import { renderer, scene, camera, controls, constrainCamera, render } from './src/stage.js';
import { loadKitchen } from './src/kitchen.js';
import { initIngredients } from './src/ingredients.js';
import { initPouring, updatePouring } from './src/pouring.js';
import { initInteraction, updateInteraction } from './src/interaction.js';
import { trackProgress } from './src/progress.js';
import { updateLights } from './src/lights.js';
import { updateTweens } from './src/tween.js';
import { updateSequences } from './src/sequence.js';
import './src/ui.js';

const world = await loadKitchen( scene, camera, controls );
initPouring( world, scene, camera ); // before the ingredients: restoring saved progress uses it
initIngredients( world );
trackProgress();
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
	updatePouring( dt );
	render();

} );
