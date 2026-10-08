// how what goes in the bowl looks: flour, sugar, the falling flour stream, egg, and the dough
import * as THREE from 'three/webgpu';
import { color, float, mix, mx_noise_float, positionWorld, smoothstep, step, time, uniform, vec3 } from 'three/tsl';

// turns the dough's pattern while it's being mixed (set by mixDough)
export const swirl = uniform( 0 );

// filled in by initMaterials()
export const materials = {};

export function initMaterials() {

	// flour: matt, a cooler white than the cream bowl, with a soft powdery mottling
	const flour = new THREE.MeshStandardNodeMaterial( { roughness: 1, vertexColors: true } );
	flour.colorNode = mix( color( 0xc9c7c1 ), color( 0xf4f4f1 ), mx_noise_float( positionWorld.mul( 260 ) ).mul( 0.5 ).add( 0.5 ) );

	// the falling stream: a soft column that breaks up into streaks as it falls
	const stream = new THREE.MeshStandardNodeMaterial( { color: 0xf3f3f0, roughness: 1, transparent: true, depthWrite: false, side: THREE.DoubleSide } );
	const streaks = mx_noise_float( vec3( positionWorld.x.mul( 500 ), positionWorld.y.add( time.mul( 1.4 ) ).mul( 45 ), positionWorld.z.mul( 500 ) ) );
	stream.opacityNode = smoothstep( - 0.35, 0.45, streaks ).mul( 0.85 );

	// sugar: tiny bright and dull specks, some of them shiny, so the heap looks grainy
	const sugar = new THREE.MeshStandardNodeMaterial( { vertexColors: true } );
	const speck = mx_noise_float( positionWorld.mul( 900 ) );
	sugar.colorNode = mix( color( 0xcdc8bf ), color( 0xffffff ), step( - 0.1, speck ) );
	sugar.roughnessNode = mix( float( 0.6 ), float( 0.08 ), step( 0.3, speck ) );

	// dough: warm golden beige, mottled; the pattern shifts with `swirl` so it churns while mixing
	const dough = new THREE.MeshStandardNodeMaterial( { roughness: 0.75, vertexColors: true } );
	const churn = mx_noise_float( positionWorld.mul( 60 ).add( vec3( swirl.sin().mul( 0.6 ), 0, swirl.cos().mul( 0.6 ) ) ) );
	dough.colorNode = mix( color( 0xc8975a ), color( 0xebd2a2 ), churn.mul( 0.5 ).add( 0.5 ) ).mul( mx_noise_float( positionWorld.mul( 300 ) ).mul( 0.06 ).add( 0.97 ) );

	Object.assign( materials, {
		flour,
		dough,
		stream,
		sugar,
		flourGrain: new THREE.MeshStandardNodeMaterial( { color: 0xf3f3f0, roughness: 1 } ),
		sugarGrain: new THREE.MeshStandardNodeMaterial( { color: 0xffffff, roughness: 0.12 } ),
		eggWhite: new THREE.MeshPhysicalNodeMaterial( { color: 0xf2e6b8, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.75, vertexColors: true } ),
		eggWhiteDrop: new THREE.MeshPhysicalNodeMaterial( { color: 0xf2e6b8, roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.75 } ),
		yolk: new THREE.MeshPhysicalNodeMaterial( { color: 0xe86400, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 } ),
	} );

}
