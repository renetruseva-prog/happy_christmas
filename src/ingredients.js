// the baking gameplay: pick an ingredient up, carry it, drop it in the bowl or put it back
import * as THREE from 'three/webgpu';
import { INGREDIENTS, HOLD_HEIGHT, HOLD_X, HOLD_Z } from './config.js';
import { getState, setState } from './state.js';
import { tweenTo, cancelTween } from './tween.js';

let kitchen = null;
let bowl = null;
let interactables = null;
export const pickRoots = []; // the top-level object of each ingredient (a label or lid is part of it)

const holdPlane = new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), - HOLD_HEIGHT );
const holdPoint = new THREE.Vector3();

export function initIngredients( world ) {

	kitchen = world.room;
	bowl = world.bowl;
	interactables = world.interactables;

	for ( const name of Object.keys( INGREDIENTS ) ) {

		let root = kitchen.getObjectByName( name );
		if ( ! root ) continue;
		while ( root.parent && root.parent !== kitchen ) root = root.parent;

		// remember where it sits so it can be put back
		root.userData.home = { position: root.position.clone(), quaternion: root.quaternion.clone(), scale: root.scale.clone() };
		root.userData.ingredient = INGREDIENTS[ name ];
		pickRoots.push( root );

	}

	setState( { total: pickRoots.length } );

}

export function pickRootOf( obj ) {

	while ( obj ) {

		if ( pickRoots.includes( obj ) ) return obj;
		obj = obj.parent;

	}

	return null;

}

export function isOverBowl( raycaster ) {

	return bowl !== null && raycaster.intersectObject( bowl, true ).length > 0;

}

export function pickUp( root ) {

	if ( getState().inBowl.includes( root ) ) return;
	cancelTween( root );
	setState( { held: root } );

}

export function putBack( root ) {

	const home = root.userData.home;
	root.quaternion.copy( home.quaternion );
	tweenTo( root, home.position, { scale: home.scale } );

}

export function dropInBowl( root ) {

	const box = new THREE.Box3().setFromObject( bowl );
	const center = box.getCenter( new THREE.Vector3() );
	const inside = kitchen.worldToLocal( new THREE.Vector3( center.x, box.max.y - 0.05, center.z ) );

	// stop it being clickable again, then let it fall into the bowl and disappear
	root.traverse( ( o ) => {

		const i = interactables.indexOf( o );
		if ( i >= 0 ) interactables.splice( i, 1 );

	} );
	setState( { inBowl: [ ...getState().inBowl, root ] } );
	tweenTo( root, inside, { duration: 0.45, arc: 0.12, scale: root.scale.clone().multiplyScalar( 0.4 ), onDone: () => { root.visible = false; } } );

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
