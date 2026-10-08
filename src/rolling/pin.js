// the rolling pin. In Blender its handles are attached to one of them, so that one carries the
// whole pin. It lies across the dough and really rolls: it turns as it moves, without slipping.
import * as THREE from 'three/webgpu';

const UP = new THREE.Vector3( 0, 1, 0 );

// find the pin in the kitchen: { root (moves the whole pin), home (where it lies on the table),
// center (its middle, in its own coordinates), radius }; null if it isn't there
export function findPin( room ) {

	const body = room.getObjectByName( 'Rolling_Pin' );
	if ( ! body ) return null;

	let root = body;
	while ( root.parent && root.parent !== room ) root = root.parent;
	root.updateMatrixWorld( true );

	body.geometry.computeBoundingBox();
	const size = body.geometry.boundingBox.getSize( new THREE.Vector3() );

	return {
		root,
		home: { position: root.position.clone(), quaternion: root.quaternion.clone() },
		center: root.worldToLocal( new THREE.Box3().setFromObject( body ).getCenter( new THREE.Vector3() ) ),
		radius: Math.min( size.x, size.z ) / 2 * body.getWorldScale( new THREE.Vector3() ).x,
	};

}

// lay the pin across the dough: its middle `along` metres along `rollDir` from `spot`, at
// `height`, lying along `sideDir` and turned `spun` radians around its length
export function placePin( pin, { spot, rollDir, sideDir, along, height, spun } ) {

	const { root, center } = pin;
	const align = new THREE.Quaternion().setFromUnitVectors( UP, sideDir ); // the pin's length (its y) across
	root.quaternion.setFromAxisAngle( sideDir, spun ).multiply( align );
	const middle = spot.clone().addScaledVector( rollDir, along ).setY( height );
	root.position.copy( middle ).sub( center.clone().multiply( root.scale ).applyQuaternion( root.quaternion ) );

}
