// the kitchen table: how high it is, what's standing on it, and how much room there is
import * as THREE from 'three/webgpu';

export const TABLE_TOP = 0.78; // height of the table's surface

// everything standing on the table (the props, not the baked room), each as its middle `c` and
// how far it reaches from it `r`. `except`: objects to leave out
export function thingsOnTable( room, except = [] ) {

	const things = [];
	const add = ( object ) => {

		const box = new THREE.Box3().setFromObject( object );
		const c = box.getCenter( new THREE.Vector3() );
		const size = box.getSize( new THREE.Vector3() );
		if ( c.y > TABLE_TOP - 0.02 && c.y < TABLE_TOP + 0.3 ) things.push( { c, r: Math.max( size.x, size.z ) / 2 } );

	};

	room.traverse( ( o ) => {

		if ( o.isMesh && ! o.userData.baked && o.visible && ! except.includes( o ) ) add( o );

	} );

	// the mixer isn't part of the kitchen model (it's built in code), so it's looked up separately
	const mixer = room.parent?.getObjectByName( 'Hand_Mixer' );
	if ( mixer?.visible && ! except.includes( mixer ) ) add( mixer );

	return things;

}

// how much room there is around (x, z) for something `radius` big: the gap to the nearest
// thing's edge (negative if they'd overlap)
export function clearance( things, x, z, radius = 0 ) {

	return things.reduce( ( m, t ) => Math.min( m, Math.hypot( t.c.x - x, t.c.z - z ) - t.r - radius ), 1 );

}

// on the table (ignoring height): how far point p is from the line from a to b
export function distanceToSegment( p, a, b ) {

	const ab = b.clone().sub( a );
	const t = THREE.MathUtils.clamp( p.clone().sub( a ).dot( ab ) / ab.lengthSq(), 0, 1 );
	return Math.hypot( p.x - ( a.x + ab.x * t ), p.z - ( a.z + ab.z * t ) );

}
