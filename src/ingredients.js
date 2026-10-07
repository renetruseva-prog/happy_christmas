// the baking gameplay: pick an ingredient up, carry it, drop/pour it in the bowl or put it back
import * as THREE from 'three/webgpu';
import { INGREDIENTS, HOLD_HEIGHT, HOLD_X, HOLD_Z } from './config.js';
import { getState, setState } from './state.js';
import { tweenTo, cancelTween } from './tween.js';
import { loadProgress } from './progress.js';
import { initBowl, isOverBowl } from './bowl.js';
import { addToBowl, restoreInBowl } from './pouring.js';

let kitchen = null;
let interactables = null;
export const pickRoots = []; // the top-level object of each ingredient (a label or lid is part of it)

const holdPlane = new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), - HOLD_HEIGHT );
const holdPoint = new THREE.Vector3();

export function initIngredients( world ) {

	kitchen = world.room;
	interactables = world.interactables;
	initBowl( world.room, world.bowl );

	for ( const [ name, { label, action } ] of Object.entries( INGREDIENTS ) ) {

		let root = kitchen.getObjectByName( name );
		if ( ! root ) continue;
		while ( root.parent && root.parent !== kitchen ) root = root.parent;

		// remember where it sits so it can be put back
		root.userData.home = { position: root.position.clone(), quaternion: root.quaternion.clone(), scale: root.scale.clone() };
		root.userData.id = name;
		root.userData.ingredient = label;
		root.userData.action = action;
		pickRoots.push( root );

	}

	// bring back what the player had already put in the bowl before the refresh
	const restored = loadProgress().map( ( id ) => pickRoots.find( ( r ) => r.userData.id === id ) ).filter( Boolean );
	restored.forEach( ( root ) => {

		removeInteractable( root );
		restoreInBowl( root ); // the finished heap / egg / butter, without the animation

	} );

	setState( { total: pickRoots.length, inBowl: restored } );

}

// an ingredient in the bowl can't be clicked any more
function removeInteractable( root ) {

	root.traverse( ( o ) => {

		const i = interactables.indexOf( o );
		if ( i >= 0 ) interactables.splice( i, 1 );

	} );

}


export function pickRootOf( obj ) {

	while ( obj ) {

		if ( pickRoots.includes( obj ) ) return obj;
		obj = obj.parent;

	}

	return null;

}

export function pickUp( root ) {

	const { busy, inBowl } = getState();
	if ( busy || inBowl.includes( root ) ) return;
	cancelTween( root );
	setState( { held: root } );

}

export function putBack( root ) {

	const home = root.userData.home;
	root.quaternion.copy( home.quaternion );
	tweenTo( root, home.position, { scale: home.scale } );

}

export function dropInBowl( root ) {

	// it can't be clicked any more; pour/crack/drop it in (see pouring.js), and only count it
	// as in the bowl once that's finished. Clicks wait while it plays (busy).
	removeInteractable( root );
	setState( { busy: true } );
	addToBowl( root ).then( () => setState( { busy: false, inBowl: [ ...getState().inBowl, root ] } ) );

}

// the player clicked while carrying something
export function releaseHeld( raycaster ) {

	const root = getState().held;
	setState( { held: null } );
	if ( isOverBowl( raycaster ) ) dropInBowl( root );
	else putBack( root );

}

// the held ingredient follows the mouse across a horizontal plane above the table
export function updateHeld( dt, ray ) {

	const { held } = getState();
	if ( ! held || ! ray.intersectPlane( holdPlane, holdPoint ) ) return;

	holdPoint.x = THREE.MathUtils.clamp( holdPoint.x, ...HOLD_X );
	holdPoint.z = THREE.MathUtils.clamp( holdPoint.z, ...HOLD_Z );
	held.position.lerp( kitchen.worldToLocal( holdPoint.clone() ), 1 - Math.exp( - dt * 14 ) );

}
