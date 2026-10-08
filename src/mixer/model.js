// the hand mixer's 3D model: a red body with a handle and two whisk beaters, built in code
import * as THREE from 'three/webgpu';

// returns { group: the whole mixer, shaker: everything inside it (shakes while the motor runs),
// beaters: [ { beater, direction } ] (each spins around its own shaft), tipY: how far the beater
// tips reach below the mixer's middle }
export function buildMixer() {

	const red = new THREE.MeshPhysicalNodeMaterial( { color: 0xb3202a, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 } );
	const cream = new THREE.MeshStandardNodeMaterial( { color: 0xf2ece0, roughness: 0.5 } );
	const steel = new THREE.MeshStandardNodeMaterial( { color: 0xd4d4d6, metalness: 0.7, roughness: 0.25 } );

	const group = new THREE.Group();
	group.name = 'Hand_Mixer';
	const shaker = new THREE.Group();
	group.add( shaker );
	const beaters = [];

	const add = ( geometry, material, x = 0, y = 0, z = 0 ) => {

		const mesh = new THREE.Mesh( geometry, material );
		mesh.position.set( x, y, z );
		mesh.castShadow = mesh.receiveShadow = true;
		shaker.add( mesh );
		return mesh;

	};

	// body: a rounded capsule lying along x, a cream cap at the front
	const body = add( new THREE.CapsuleGeometry( 0.032, 0.11, 8, 20 ), red );
	body.rotation.z = Math.PI / 2;
	body.scale.set( 1, 1, 0.85 );
	add( new THREE.CylinderGeometry( 0.026, 0.026, 0.012, 24 ), cream, 0.083, 0, 0 ).rotation.z = Math.PI / 2;

	// handle: an arch over the body, with the speed switch in front of it
	add( new THREE.TorusGeometry( 0.042, 0.011, 12, 32, Math.PI ), red, - 0.012, 0.022, 0 );
	add( new THREE.BoxGeometry( 0.018, 0.008, 0.012 ), cream, 0.042, 0.03, 0 );

	// two beaters under the front of the body; each spins around its own shaft, in opposite directions
	for ( const [ x, direction ] of [ [ 0.018, 1 ], [ 0.052, - 1 ] ] ) {

		const beater = new THREE.Group();
		beater.position.set( x, - 0.025, 0 );
		shaker.add( beater );

		const shaft = new THREE.Mesh( new THREE.CylinderGeometry( 0.0025, 0.0025, 0.08, 8 ), steel );
		shaft.position.y = - 0.04;
		beater.add( shaft );

		// the whisk: four upright wire loops around the shaft
		for ( let i = 0; i < 4; i ++ ) {

			const loop = new THREE.Mesh( new THREE.TorusGeometry( 0.012, 0.0014, 6, 24 ), steel );
			loop.scale.set( 1, 1.5, 1 );
			loop.rotation.y = i * Math.PI / 4;
			loop.position.y = - 0.082;
			beater.add( loop );

		}

		beater.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = true; } );
		beaters.push( { beater, direction } );

	}

	group.updateMatrixWorld( true );
	const tipY = new THREE.Box3().setFromObject( group ).min.y;
	return { group, shaker, beaters, tipY };

}
