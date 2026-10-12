// fixed camera points: where the camera goes to show something well, and how it gets there.
// While it's moving (and for as long as the caller holds it there) the player can't turn the view
import * as THREE from 'three/webgpu';
import { camera, controls } from './stage.js';
import { animate, ease } from './sequence.js';

export const VIEWS = {
	// high up and in front of the mixing bowl, looking down into it: the whole pouring, cracking
	// and dropping can be seen from here
	pour: { position: new THREE.Vector3( 0.0, 1.5, 0.48 ), target: new THREE.Vector3( 0.0, 0.93, - 0.06 ) },
	// the baking tray on the counter, next to the oven
	oven: { position: new THREE.Vector3( 1.15, 1.4, - 0.2 ), target: new THREE.Vector3( 1.45, 0.62, - 1.5 ) },
};

// where the camera is now, to come back to
export function currentView() {

	return { position: camera.position.clone(), target: controls.target.clone() };

}

// glide to a view (the player can't turn the view meanwhile). Pass { release: false } to keep the
// view locked afterwards, and unlock it later with lockView( false )
export async function moveCameraTo( view, { duration = 1.0, release = true } = {} ) {

	controls.enabled = false;
	const fromP = camera.position.clone();
	const fromT = controls.target.clone();

	await animate( duration, ( k ) => {

		camera.position.lerpVectors( fromP, view.position, ease( k ) );
		controls.target.lerpVectors( fromT, view.target, ease( k ) );

	} );

	if ( release ) controls.enabled = true;

}

export function lockView( locked = true ) {

	controls.enabled = ! locked;

}
