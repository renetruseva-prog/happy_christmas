// mouse input: what's under the cursor, hover hints, clicks and keys
import * as THREE from 'three/webgpu';
import { getState, setState } from './state.js';
import { showHint, hideHint } from './ui.js';
import { pickRoots, pickRootOf, isOverBowl, pickUp, putBack, releaseHeld, updateHeld } from './ingredients.js';

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

	raycaster.setFromCamera( pointer, camera );

	if ( getState().held ) {

		releaseHeld( raycaster );
		return;

	}

	const hit = raycaster.intersectObjects( pickRoots, true )[ 0 ];
	const root = hit ? pickRootOf( hit.object ) : null;
	if ( root ) pickUp( root );

}

function updateHover() {

	if ( getState().held ) {

		const over = isOverBowl( raycaster );
		const { ingredient } = getState().held.userData;
		showHint( over ? `click to drop ${ ingredient } in the bowl` : 'click the bowl to drop it in · click elsewhere or Esc to put it back', { clickable: over } );
		return;

	}

	const hit = raycaster.intersectObjects( [ ...interactables, ...pickRoots ], true )[ 0 ];
	const root = hit ? pickRootOf( hit.object ) : null;
	const target = hit ? findInteractable( hit.object ) : null;

	if ( root ) showHint( `${ root.userData.ingredient } · pick up` );
	else if ( target ) showHint( `${ target.name.replaceAll( '_', ' ' ) } · ${ target.userData.action.replaceAll( '_', ' ' ) }` );
	else hideHint();

}

export function updateInteraction( dt ) {

	raycaster.setFromCamera( pointer, camera );
	updateHover();
	updateHeld( dt, raycaster.ray );

}
