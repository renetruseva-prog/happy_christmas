// where things go on the table for rolling: the empty bowl is slid to the back, out of the way,
// and the dough goes where it and the rolling pin lying across it have room
import * as THREE from 'three/webgpu';
import { TABLE_TOP, thingsOnTable, clearance, distanceToSegment } from '../table.js';

const DOUGH_X = [ - 0.6, 0.6 ]; // where on the table the dough can go (with room for the rolled-out sheet)
const DOUGH_Z = [ - 0.42, 0.12 ];
const BACK_Z = [ - 0.48, - 0.3 ]; // the back of the table, where the empty bowl is slid to
const PIN_HALF_LENGTH = 0.27; // half the rolling pin's length, handles included
export const SHEET_ROOM = 0.17; // how far the rolled-out sheet spreads

// the free spot at the back nearest to where the bowl is now; returns the bowl's new position
export function findBowlSpot( room, bowl, except = [] ) {

	const box = new THREE.Box3().setFromObject( bowl );
	const radius = box.getSize( new THREE.Vector3() ).x / 2;
	const now = box.getCenter( new THREE.Vector3() );
	const things = thingsOnTable( room, [ bowl, ...except ] );

	let best = now;
	let bestScore = - Infinity;
	for ( let x = - 0.65; x <= 0.65; x += 0.02 ) {

		for ( let z = BACK_Z[ 0 ]; z <= BACK_Z[ 1 ]; z += 0.02 ) {

			const score = Math.min( clearance( things, x, z, radius ), 0.03 ) - Math.hypot( x - now.x, z - now.z ) * 0.02;
			if ( score > bestScore ) {

				bestScore = score;
				best = new THREE.Vector3( x, 0, z );

			}

		}

	}

	return bowl.position.clone().add( new THREE.Vector3( best.x - now.x, 0, best.z - now.z ) );

}

// a spot for the dough with room for the rolling pin across it wherever it rolls to (from one
// edge of the sheet to the other) and for the sheet around the middle, preferring the front
// of the table. rollDir: the way the pin rolls; sideDir: the way it lies
export function findDoughSpot( room, rollDir, sideDir, except = [] ) {

	const things = thingsOnTable( room, except ); // (the pin too: it lies there until it's picked up)
	let best = null;
	let bestScore = - Infinity;

	for ( let x = DOUGH_X[ 0 ]; x <= DOUGH_X[ 1 ]; x += 0.02 ) {

		for ( let z = DOUGH_Z[ 0 ]; z <= DOUGH_Z[ 1 ]; z += 0.02 ) {

			let free = clearance( things, x, z, SHEET_ROOM );
			for ( const s of [ - SHEET_ROOM, 0, SHEET_ROOM ] ) {

				const c = new THREE.Vector3( x, 0, z ).addScaledVector( rollDir, s );
				const a = c.clone().addScaledVector( sideDir, - PIN_HALF_LENGTH );
				const b = c.clone().addScaledVector( sideDir, PIN_HALF_LENGTH );
				for ( const t of things ) free = Math.min( free, distanceToSegment( t.c, a, b ) - t.r );

			}

			const score = Math.min( free, 0.06 ) + z * 0.05; // enough room first, then closer to the player
			if ( score > bestScore ) {

				bestScore = score;
				best = new THREE.Vector3( x, TABLE_TOP, z );

			}

		}

	}

	return best;

}
