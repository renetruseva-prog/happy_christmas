// mouse input: what's under the cursor, hover hints, clicks and keys
import * as THREE from 'three/webgpu';
import { getState, setState } from './state.js';
import { showHint, hideHint } from './ui.js';
import { resetProgress } from './progress.js';
import { isOverBowl } from './bowl/index.js';
import { pickRoots, pickRootOf, pickUp, putBack, releaseHeld, updateHeld } from './ingredients.js';
import { mixerHint, tryGrabMixer } from './mixer/index.js';
import { rollingHint, tryRollingClick } from './rolling/index.js';
import { cuttingHint, tryCuttingClick } from './cutting/index.js';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2( 2, 2 );
let camera = null;
let interactables = [];

export function initInteraction( { camera: cam, canvas, interactables: list } ) {

	camera = cam;
	interactables = list;

	window.addEventListener( 'pointermove', ( e ) => {

		pointer.set( ( e.clientX / window.innerWidth ) * 2 - 1, - ( e.clientY / window.innerHeight ) * 2 + 1 );

	} );

	// a click is a press and release that barely moved (dragging orbits the camera instead)
	let downAt = null;
	canvas.addEventListener( 'pointerdown', ( e ) => { downAt = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; } );
	canvas.addEventListener( 'pointerup', ( e ) => {

		if ( downAt && Math.hypot( e.clientX - downAt.x, e.clientY - downAt.y ) < 5 ) onClick();
		downAt = null;

	} );

	window.addEventListener( 'keydown', ( e ) => {

		if ( e.key === 'r' || e.key === 'R' ) resetProgress();

		const { held } = getState();
		if ( e.key === 'Escape' && held ) {

			putBack( held );
			setState( { held: null } );

		}

	} );

}

function findInteractable( obj ) {

	while ( obj ) {

		if ( obj.userData.interactable ) return obj;
		obj = obj.parent;

	}

	return null;

}

function onClick() {

	const { busy, mixing, rolling } = getState();
	if ( busy || mixing || rolling ) return; // (while mixing or rolling, the mouse button does that)
	raycaster.setFromCamera( pointer, camera );

	if ( getState().held ) {

		releaseHeld( raycaster );
		return;

	}

	if ( tryCuttingClick( raycaster ) ) return;
	if ( tryRollingClick( raycaster ) ) return;
	if ( tryGrabMixer( raycaster ) ) return;

	const hit = raycaster.intersectObjects( pickRoots.filter( ( r ) => r.visible ), true )[ 0 ];
	const root = hit ? pickRootOf( hit.object ) : null;
	if ( root ) pickUp( root );

}

function updateHover() {

	if ( getState().busy ) {

		hideHint();
		return;

	}

	const cuttingText = cuttingHint( raycaster );
	if ( cuttingText === false ) {

		hideHint();
		return;

	}

	if ( cuttingText ) {

		showHint( cuttingText.text, { clickable: cuttingText.clickable } );
		return;

	}

	const rollingText = rollingHint( raycaster );
	if ( rollingText === false ) {

		hideHint();
		return;

	}

	if ( rollingText ) {

		showHint( rollingText.text, { clickable: rollingText.clickable } );
		return;

	}

	const mixerText = mixerHint( raycaster );
	if ( mixerText === false ) {

		hideHint();
		return;

	}

	if ( mixerText ) {

		showHint( mixerText.text, { clickable: mixerText.clickable } );
		return;

	}

	if ( getState().held ) {

		const over = isOverBowl( raycaster );
		const { ingredient } = getState().held.userData;
		showHint( over ? `click to drop ${ ingredient } in the bowl` : 'click the bowl to drop it in · click elsewhere or Esc to put it back', { clickable: over } );
		return;

	}

	const hit = raycaster.intersectObjects( [ ...interactables, ...pickRoots.filter( ( r ) => r.visible ) ], true )[ 0 ];
	const root = hit ? pickRootOf( hit.object ) : null;
	const target = hit ? findInteractable( hit.object ) : null;

	if ( root && getState().inBowl.includes( root ) ) showHint( `${ root.userData.ingredient } · already in the bowl`, { clickable: false } );
	else if ( root ) showHint( `${ root.userData.ingredient } · pick up` );
	else if ( target ) showHint( `${ target.name.replaceAll( '_', ' ' ) } · ${ target.userData.action.replaceAll( '_', ' ' ) }` );
	else hideHint();

}

export function updateInteraction( dt ) {

	raycaster.setFromCamera( pointer, camera );
	updateHover();
	updateHeld( dt, raycaster.ray );

}
