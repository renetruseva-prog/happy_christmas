// smoke curling up out of the oven when the cookies start to burn: the Shadertoy smoke (see
// shaders/smoke.js) on a plane rising from the top of the oven door, always turned to face the
// player. It gets thicker and darker as they burn. The mouse pushes it aside, and waving it
// (moving the mouse quickly over it) clears it for a while, like waving smoke away
import * as THREE from 'three/webgpu';
import { uniform, uv, mix, vec3, smoothstep, abs, float } from 'three/tsl';
import { smoke } from '../shaders/smoke.js';

const WIDTH = 0.9;
const HEIGHT = 1.0;

let mesh = null;

// the shader's inputs (Shadertoy's iTime, plus what was added)
const iTime = uniform( 0 );
const iMouse = uniform( new THREE.Vector2( 0.5, - 1 ) ); // 0..1 on the smoke
const hover = uniform( 0 );
const amount = uniform( 0 ); // 0 none .. 1 thick
const dark = uniform( 0 ); // 0 grey .. 1 black
const cleared = uniform( 0 ); // how much it's been waved away (0..1)

const WAVE = 1.6; // how fast waving clears it (per unit of the smoke's width the mouse moves)
const SETTLE = 0.12; // how fast it comes back (per second)
let over = false; // the mouse is on the smoke
const lastMouse = new THREE.Vector2();

const plane = new THREE.Plane();
const at = new THREE.Vector3();
const normal = new THREE.Vector3();

export function initSmoke( room ) {

	const door = room.getObjectByName( 'Oven_Door' );
	if ( ! door ) return;
	const box = new THREE.Box3().setFromObject( door );

	// where the smoke is: a column, narrow at the bottom and spreading out as it rises, fading
	// out at the top
	const st = uv();
	const width = mix( float( 0.18 ), float( 0.45 ), st.y );
	const column = float( 1 ).sub( smoothstep( width.mul( 0.5 ), width, abs( st.x.sub( 0.5 ) ) ) );
	const fade = smoothstep( 0.0, 0.1, st.y ).mul( float( 1 ).sub( smoothstep( 0.5, 1.0, st.y ) ) );

	const density = smoke( { time: iTime, rise: float( 0.18 ), mouse: iMouse, hover } );

	const material = new THREE.MeshBasicNodeMaterial( { transparent: true, depthWrite: false, side: THREE.DoubleSide } );
	material.colorNode = mix( vec3( 0.45, 0.43, 0.41 ), vec3( 0.04, 0.035, 0.03 ), dark );
	material.opacityNode = density.mul( 2.5 ).mul( column ).mul( fade ).mul( amount ).mul( float( 1 ).sub( cleared.mul( 0.85 ) ) ).clamp( 0, 1 ); // (the original's grey is faint as smoke)

	mesh = new THREE.Mesh( new THREE.PlaneGeometry( WIDTH, HEIGHT ), material );
	mesh.name = 'Oven_Smoke';
	mesh.position.set( ( box.min.x + box.max.x ) / 2, box.max.y + HEIGHT / 2 - 0.04, box.max.z + 0.04 );
	mesh.visible = false;
	mesh.renderOrder = 2; // over the other see-through things (the oven window)
	room.add( mesh );

}

// target: how much smoke (0..1); darkness: 0 grey .. 1 black; ray: where the mouse points;
// camera: the smoke turns to face it
export function updateSmoke( dt, { target, darkness, ray, camera } ) {

	if ( ! mesh ) return;

	iTime.value += dt;
	amount.value += ( target - amount.value ) * ( 1 - Math.exp( - dt * 0.8 ) );
	dark.value += ( darkness - dark.value ) * ( 1 - Math.exp( - dt * 0.8 ) );
	mesh.visible = amount.value > 0.005;
	if ( ! mesh.visible ) {

		over = false;
		return;

	}

	// turn to face the camera, staying upright
	mesh.rotation.y = Math.atan2( camera.position.x - mesh.position.x, camera.position.z - mesh.position.z );
	mesh.updateMatrixWorld();

	// where the mouse is on the smoke
	normal.set( 0, 0, 1 ).transformDirection( mesh.matrixWorld );
	plane.setFromNormalAndCoplanarPoint( normal, mesh.getWorldPosition( at ) );
	const wasOver = over;
	over = false;
	if ( ray.intersectPlane( plane, at ) ) {

		mesh.worldToLocal( at );
		const u = at.x / WIDTH + 0.5;
		const v = at.y / HEIGHT + 0.5;
		over = u > 0.1 && u < 0.9 && v > 0 && v < 0.8 && amount.value > 0.05;
		if ( over ) {

			// waving: the further the mouse moves over it, the more it clears
			if ( wasOver ) cleared.value = Math.min( 1, cleared.value + lastMouse.distanceTo( new THREE.Vector2( u, v ) ) * WAVE );
			lastMouse.set( u, v );
			iMouse.value.lerp( lastMouse, 1 - Math.exp( - dt * 10 ) );

		}

	}

	cleared.value = Math.max( 0, cleared.value - SETTLE * dt );
	hover.value += ( ( over ? 1 : 0 ) - hover.value ) * ( 1 - Math.exp( - dt * 5 ) );

}

// how thick the smoke is right now, after waving (0..1)
export function smokeLevel() {

	return mesh?.visible ? amount.value * ( 1 - cleared.value * 0.85 ) : 0;

}

// the mouse is on the smoke
export function overSmoke() {

	return over;

}

// a puff of it (the oven door opening while it's smoky inside)
export function puffSmoke( extra ) {

	amount.value = Math.min( 1, amount.value + extra );

}
