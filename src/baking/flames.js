// the flames at the back of the oven, licking up behind the tray: the Shadertoy fire (see
// shaders/fire.js) on a plane across the back of the inside, added on top of what's behind it (black is see-through). They
// burn while the cookies bake, lean towards the mouse and reach up under it while it's over the
// oven, and flare up when the door is opened
import * as THREE from 'three/webgpu';
import { uniform, uv, smoothstep, sRGBTransferEOTF } from 'three/tsl';
import { fire } from '../shaders/fire.js';
import { inside, doorOpen } from './oven.js';

const BRIGHTNESS = 2.0; // over 1, so the flames glow (and show through the dark oven window)

let mesh = null;
let size = null; // the plane's width and height
let lastOpen = 0;

// the shader's inputs (Shadertoy's iTime, iResolution, iMouse, plus what was added)
const iTime = uniform( 0 );
const iResolution = uniform( new THREE.Vector2( 1, 1 ) );
const iMouse = uniform( new THREE.Vector2( 0.5, 0.5 ) ); // 0..1 across the fire
const hover = uniform( 0 ); // the mouse is over the oven (eased)
const heat = uniform( 0 ); // 0 out .. 1 full
const flare = uniform( 0 );

const plane = new THREE.Plane();
const at = new THREE.Vector3();

export function initFlames( room ) {

	if ( ! inside ) return;

	size = new THREE.Vector2( ( inside.max.x - inside.min.x ) * 0.96, ( inside.max.y - inside.min.y ) * 0.95 );
	iResolution.value.copy( size ).multiplyScalar( 1000 ); // "pixels": a millimetre each

	const material = new THREE.MeshBasicNodeMaterial( { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } );
	// soft at the sides and the top, so it isn't a rectangle
	const sides = smoothstep( 0, 0.12, uv().x ).mul( smoothstep( 1, 0.88, uv().x ) ).mul( smoothstep( 1, 0.85, uv().y ) );
	// Shadertoy's colours go straight to the screen (sRGB); three.js works in linear colour and
	// converts at the end, so convert them first or they come out washed out
	const color = sRGBTransferEOTF( fire( { time: iTime, resolution: iResolution, mouse: iMouse, hover, heat, flare } ) );
	material.colorNode = color.mul( sides ).mul( flare.mul( 0.8 ).add( 1 ) ).mul( BRIGHTNESS ); // (brighter while it flares)

	mesh = new THREE.Mesh( new THREE.PlaneGeometry( size.x, size.y ), material );
	mesh.name = 'Oven_Flames';
	mesh.position.set( ( inside.min.x + inside.max.x ) / 2, inside.min.y + size.y / 2 + 0.002, inside.min.z + 0.03 );
	mesh.visible = false;
	room.add( mesh );

}

// how much it's flaring right now (0..1), for the oven's light
export function flareLevel() {

	return mesh?.visible ? flare.value : 0;

}

// target: how hot it should be (0..1); ray: where the mouse points; overOven: and it's on the oven
export function updateFlames( dt, { target, ray, overOven } ) {

	if ( ! mesh ) return;

	iTime.value += dt;
	heat.value += ( target - heat.value ) * ( 1 - Math.exp( - dt * ( target > heat.value ? 2 : 1.2 ) ) );
	mesh.visible = heat.value > 0.01;
	if ( ! mesh.visible ) return;

	// where the mouse is on the fire (it can be off the edges: the flames just lean all the way)
	hover.value += ( ( overOven ? 1 : 0 ) - hover.value ) * ( 1 - Math.exp( - dt * 4 ) );
	if ( overOven ) {

		mesh.updateMatrixWorld();
		plane.setFromNormalAndCoplanarPoint( new THREE.Vector3( 0, 0, 1 ).transformDirection( mesh.matrixWorld ), mesh.getWorldPosition( at ) );
		if ( ray.intersectPlane( plane, at ) ) {

			mesh.worldToLocal( at );
			const target = new THREE.Vector2( THREE.MathUtils.clamp( at.x / size.x + 0.5, - 0.5, 1.5 ), THREE.MathUtils.clamp( at.y / size.y + 0.5, 0, 1 ) );
			iMouse.value.lerp( target, 1 - Math.exp( - dt * 8 ) );

		}

	}

	// opening the door lets air in: the flames flare up, then settle
	const open = doorOpen();
	if ( open > lastOpen ) flare.value = Math.min( 1, flare.value + ( open - lastOpen ) * 2.5 );
	lastOpen = open;
	flare.value *= Math.exp( - dt * 0.7 );

}
