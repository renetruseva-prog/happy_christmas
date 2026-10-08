// dropping the butter: it's carried over a free spot in the bowl and falls in, tumbling, then lands
// flat along the bowl's wall with a little bounce. Its paper stays on the table.
import * as THREE from 'three/webgpu';
import { animate, until, arcLerp, ease } from '../sequence.js';
import { ctx, bowl, solids, claimSpot, surfaceY } from './contents.js';
import { GRAVITY } from './particles.js';

const UP = new THREE.Vector3( 0, 1, 0 );

// the paper is attached to the butter in Blender: take it off, so it stays on the table and only
// the butter itself is picked up and dropped in the bowl
export function unwrapButter() {

	const wrapper = ctx.room.getObjectByName( 'Butter_Block' )?.getObjectByName( 'Butter_Wrapper' );
	if ( wrapper ) ctx.room.attach( wrapper );

}

// where the butter lies in the bowl: a free spot a little off the middle, its long side along the
// bowl's wall, and high enough that no part of its underside sinks into the curved bowl (or
// into what's already in it), so it rests across the bowl like a real block would
function butterRest( root ) {

	const spot = claimSpot( 0.03, 0.045, { ring: true } );
	const outward = Math.atan2( spot.z - bowl.center.z, spot.x - bowl.center.x );
	const quaternion = new THREE.Quaternion().setFromAxisAngle( UP, - outward - Math.PI / 2 ).multiply( root.userData.home.quaternion );

	// check a grid of points across the underside
	root.geometry.computeBoundingBox();
	const { min, max } = root.geometry.boundingBox;
	const p = new THREE.Vector3();
	let y = - Infinity;
	for ( let i = 0; i <= 4; i ++ ) {

		for ( let j = 0; j <= 4; j ++ ) {

			p.set( THREE.MathUtils.lerp( min.x, max.x, i / 4 ), min.y, THREE.MathUtils.lerp( min.z, max.z, j / 4 ) ).multiply( root.scale ).applyQuaternion( quaternion );
			y = Math.max( y, surfaceY( spot.x + p.x, spot.z + p.z ) - p.y );

		}

	}

	return { position: new THREE.Vector3( spot.x, y + 0.001, spot.z ), quaternion };

}

export async function dropButter( root ) {

	const home = root.userData.home;
	const start = root.position.clone();
	const startQ = root.quaternion.clone();

	// where it will lie (somewhere free, so it doesn't land on a yolk)
	const rest = butterRest( root );
	const above = new THREE.Vector3( rest.position.x, bowl.rimY + 0.12, rest.position.z );

	await animate( 0.45, ( k ) => {

		arcLerp( root.position, start, above, ease( k ), 0.04 );
		root.quaternion.slerpQuaternions( startQ, home.quaternion, ease( k ) );

	} );

	// fall, tumbling
	const axis = new THREE.Vector3( Math.random() - 0.5, 0, Math.random() - 0.5 ).normalize();
	const upright = root.quaternion.clone();
	const restY = rest.position.y;
	let angle = 0;
	let vy = 0;
	await until( ( dt ) => {

		vy -= GRAVITY * dt;
		root.position.y += vy * dt;
		angle += 6 * dt;
		root.quaternion.setFromAxisAngle( axis, angle ).multiply( upright );
		return root.position.y <= restY + 0.01;

	} );

	// land flat with a little bounce, lying along the bowl's wall
	const landQ = root.quaternion.clone();
	await animate( 0.25, ( k ) => {

		root.quaternion.slerpQuaternions( landQ, rest.quaternion, ease( k ) );
		root.position.y = restY + 0.012 * Math.sin( Math.PI * k );

	} );
	root.position.y = restY;
	solids.push( root );

}

// dropped in before a page refresh: lying where it landed
export function restoreButter( root ) {

	const rest = butterRest( root );
	root.position.copy( rest.position );
	root.quaternion.copy( rest.quaternion );
	solids.push( root );

}
