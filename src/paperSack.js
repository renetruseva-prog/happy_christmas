// the flour bag's paper: fine straight lines running all the way round it, parallel to its top
// and bottom edges (like the ribbing on a paper sack). Made in code, so no texture file; the
// lines follow the bag's own height, so they stay straight and parallel however it's turned
import * as THREE from 'three/webgpu';
import { color, positionLocal, smoothstep, abs, fract, mix } from 'three/tsl';

const PITCH = 0.006; // metres from one line to the next
const WIDTH = 0.3; // how much of each step is line (0..1)
const DEPTH = 0.09; // how much darker the lines are than the paper

export function paperSack( mesh ) {

	const old = mesh.material;
	const material = new THREE.MeshStandardNodeMaterial( { roughness: old.roughness, metalness: old.metalness } );

	// how far this point is from the middle of its step (0 on a line .. 0.5 halfway to the next)
	const away = abs( fract( positionLocal.y.div( PITCH ) ).sub( 0.5 ) );
	const line = smoothstep( WIDTH / 2, WIDTH / 4, away ); // 1 on a line, 0 between them
	material.colorNode = color( old.color ).mul( mix( 1, 1 - DEPTH, line ) );

	mesh.material = material;

}
