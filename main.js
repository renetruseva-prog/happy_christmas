// entry point: builds the stage, loads the kitchen and runs the frame loop
import { renderer, scene, camera, controls, constrainCamera, render } from './src/stage.js';
import { loadKitchen } from './src/kitchen.js';
import { initIngredients } from './src/ingredients.js';
import { initInteraction, updateInteraction } from './src/interaction.js';
import { updateLights } from './src/lights.js';
import { updateTweens } from './src/tween.js';
import './src/ui.js';

const world = await loadKitchen( scene, camera, controls );
initIngredients( world );
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
	render();

} );
