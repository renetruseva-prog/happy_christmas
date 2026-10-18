// the solid furniture, as boxes on the floor (taken from the shapes of these parts of the kitchen
// model). The player can't walk through them (see walking.js), and the camera can't go under or
// into them however it's turned, zoomed or panned (see constrainCamera in stage.js)
import * as THREE from 'three/webgpu';

const SOLID = [ 'Table_Top_Baked', 'Counter_Cabinets_Baked', 'Countertop_Baked', 'Oven_Body_Baked', 'Tree_Tier_0_Baked', 'Tree_Pot_Baked' ];
const SHRINK = { Tree_Tier_0_Baked: 0.15 }; // (the tree's branches are soft: a little give)
const TOP = { Tree_Tier_0_Baked: 1.5, Tree_Pot_Baked: 1.5 }; // (how high the thing is, where the model's box isn't it)
const OVER = 0.17; // the camera has to be this far above the top of something to be over it
const FLOOR = 0.3; // and this far above the floor

const solids = []; // { minX, maxX, minZ, maxZ, top }

export function addSolids( room ) {

	room.updateMatrixWorld( true );
	for ( const name of SOLID ) {

		const mesh = room.getObjectByName( name );
		if ( ! mesh ) continue;
		const box = new THREE.Box3().setFromObject( mesh );
		const give = SHRINK[ name ] ?? 0;
		solids.push( { minX: box.min.x + give, maxX: box.max.x - give, minZ: box.min.z + give, maxZ: box.max.z - give, top: TOP[ name ] ?? box.max.y } );

	}

}

// push p (x and z) out of anything closer than `radius`, sideways. height: where p is (in y), and
// only things that reach that high count: pass null for a person on the floor, who is stopped by
// everything
function pushOut( p, radius, height = null ) {

	const out = p.clone();
	for ( let pass = 0; pass < 3; pass ++ ) {

		let moved = false;
		for ( const b of solids ) {

			if ( height !== null && height > b.top + OVER ) continue; // (above it: nothing in the way)

			const nearX = THREE.MathUtils.clamp( out.x, b.minX, b.maxX );
			const nearZ = THREE.MathUtils.clamp( out.z, b.minZ, b.maxZ );
			const dx = out.x - nearX;
			const dz = out.z - nearZ;
			const d2 = dx * dx + dz * dz;
			if ( d2 >= radius * radius ) continue;

			if ( d2 > 1e-9 ) {

				// beside it or at a corner: pushed straight away from the nearest point
				const d = Math.sqrt( d2 );
				out.x = nearX + dx / d * radius;
				out.z = nearZ + dz / d * radius;

			} else {

				// right inside it: out through the nearest side
				const sides = [ out.x - b.minX, b.maxX - out.x, out.z - b.minZ, b.maxZ - out.z ];
				const nearest = Math.min( ...sides );
				if ( nearest === sides[ 0 ] ) out.x = b.minX - radius;
				else if ( nearest === sides[ 1 ] ) out.x = b.maxX + radius;
				else if ( nearest === sides[ 2 ] ) out.z = b.minZ - radius;
				else out.z = b.maxZ + radius;

			}

			moved = true;

		}

		if ( ! moved ) break;

	}

	return out;

}

// where a person standing on the floor at p ends up
export function standingAt( p, radius ) {

	return pushOut( p, radius );

}

// keep a camera out of the furniture: not under the table, not inside the counters, not in the
// tree, and not through the floor. It's only stopped when it's low enough to be inside something;
// high above them it's free to look down on everything
export function keepCameraOut( camera, margin = 0.1 ) {

	camera.position.y = Math.max( camera.position.y, FLOOR );
	const out = pushOut( camera.position, margin, camera.position.y );
	camera.position.x = out.x;
	camera.position.z = out.z;

}
