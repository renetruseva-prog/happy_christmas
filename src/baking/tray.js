// the baking tray on the counter next to the oven: the cookies go on it in two rows of three,
// and it slides into the oven on the rack and back out again
import * as THREE from 'three/webgpu';
import { animate, ease } from '../sequence.js';

const ROWS = 2;
const PER_ROW = 3;

// { mesh, home, centre (where its middle is when it's home), top (its paper's height), slots }, or null
export function findTray( room ) {

	const mesh = room.getObjectByName( 'Baking_Tray' );
	if ( ! mesh ) return null;

	// the paper lies on it, so it goes along
	const paper = room.getObjectByName( 'Baking_Paper' );
	room.updateMatrixWorld( true );
	if ( paper ) mesh.attach( paper );

	const box = new THREE.Box3().setFromObject( mesh );
	const centre = box.getCenter( new THREE.Vector3() );
	const size = box.getSize( new THREE.Vector3() );
	const top = paper ? new THREE.Box3().setFromObject( paper ).max.y : box.min.y + 0.005;

	// where the cookies go, in the tray's own coordinates (so they move with it)
	const slots = [];
	for ( let row = 0; row < ROWS; row ++ ) {

		for ( let i = 0; i < PER_ROW; i ++ ) {

			const x = centre.x + ( i - ( PER_ROW - 1 ) / 2 ) * size.x * 0.29;
			const z = centre.z + ( row - ( ROWS - 1 ) / 2 ) * size.z * 0.46;
			slots.push( mesh.worldToLocal( new THREE.Vector3( x, top, z ) ) );

		}

	}

	return { mesh, home: mesh.position.clone(), centre, slots };

}

// where on the tray (in the world) cookie number i goes
export function slotPosition( tray, i ) {

	tray.mesh.updateMatrixWorld( true );
	return tray.mesh.localToWorld( tray.slots[ i % tray.slots.length ].clone() );

}

// put the tray's middle at `to`
export function placeTray( tray, to ) {

	tray.mesh.position.copy( tray.home ).add( to ).sub( tray.centre );

}

function trayCentre( tray ) {

	return tray.mesh.position.clone().sub( tray.home ).add( tray.centre );

}

// slide its middle to `to` (lift: how high it arcs on the way)
export function moveTray( tray, to, { duration = 0.7, lift = 0 } = {} ) {

	const from = trayCentre( tray );
	const at = new THREE.Vector3();
	return animate( duration, ( k ) => {

		at.lerpVectors( from, to, ease( k ) );
		at.y += Math.sin( Math.PI * k ) * lift;
		placeTray( tray, at );

	} );

}
