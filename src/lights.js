// the extra lights, plus the candle flicker and christmas-light twinkle
import * as THREE from 'three/webgpu';

const flickerLights = [];
const twinkleLights = [];
const twinkleBulbs = [];

// lights that glTF can't carry over from Blender (area lights)
export function addExtraLights( scene ) {

	scene.add( new THREE.HemisphereLight( 0xffd2a0, 0x2a1a10, 0.15 ) );

	const windowLight = new THREE.SpotLight( 0x7393ff, 6, 6, Math.PI / 3, 0.8 );
	windowLight.position.set( - 1, 1.65, - 2.4 );
	windowLight.target.position.set( - 0.6, 0.6, 0 );
	scene.add( windowLight, windowLight.target );

}

// called for every light in the kitchen: animate it if its name says so
export function trackLight( light ) {

	const entry = { light, base: light.intensity, seed: Math.random() * 100 };
	if ( light.name.startsWith( 'Light_XLights' ) || light.name === 'Light_Tree_Glow' ) twinkleLights.push( entry );
	if ( light.name.startsWith( 'Candle' ) ) flickerLights.push( entry );

}

// each colour of bulb gets its own material so it can twinkle on its own
export function trackBulb( mesh ) {

	mesh.material = mesh.material.clone();
	twinkleBulbs.push( { material: mesh.material, base: mesh.material.emissiveIntensity ?? 1, seed: Math.random() * 100 } );

}

export function updateLights( t ) {

	for ( const f of flickerLights ) f.light.intensity = f.base * ( 0.85 + 0.15 * Math.sin( t * 9 + f.seed ) * Math.sin( t * 3.7 + f.seed * 2 ) );

	// christmas lights: slow, soft pulse (each light/bulb is offset by its seed)
	for ( const f of twinkleLights ) f.light.intensity = f.base * ( 0.7 + 0.3 * Math.sin( t * 2.2 + f.seed ) );
	for ( const b of twinkleBulbs ) b.material.emissiveIntensity = b.base * ( 0.6 + 0.4 * Math.sin( t * 2.2 + b.seed ) );

}
