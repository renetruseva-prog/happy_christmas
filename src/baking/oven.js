// the oven: its door swings open on a hinge along the bottom, it glows hotter while something
// bakes, and the little display above the door shows the baking clock.
// In the kitchen model the oven is a solid box with the door on the front, so it gets an inside
// here: an opening in the front (the box isn't drawn there), a cavity behind it, and a see-through
// window in the door so you can watch the cookies bake
import * as THREE from 'three/webgpu';
import { and, positionLocal, positionWorld } from 'three/tsl';
import { animate, ease } from '../sequence.js';

const OPEN_ANGLE = 1.45; // how far the door swings down (radians)
const HEAT = 2.5; // how much brighter the glow gets while baking

let hinge = null; // the door turns around this
let glowLight = null;
let glowBase = 0;
let cavityMaterial = null; // the inside, glowing when it's hot
let display = null; // { canvas, texture }
export const ovenParts = []; // everything that counts as "the oven" when dropping a cookie on it

export function initOven( room ) {

	room.traverse( ( o ) => { if ( o.isMesh && o.name.startsWith( 'Oven' ) ) ovenParts.push( o ); } );

	const door = room.getObjectByName( 'Oven_Door' );
	const body = room.getObjectByName( 'Oven_Body_Baked' );
	if ( door && body ) makeInside( room, door, body );

	// the hinge: along the bottom of the door, at its back
	if ( door ) {

		const box = new THREE.Box3().setFromObject( door );
		hinge = new THREE.Object3D();
		hinge.position.set( ( box.min.x + box.max.x ) / 2, box.min.y, box.min.z );
		room.add( hinge );
		room.updateMatrixWorld( true );
		hinge.attach( door );

	}

	glowLight = room.getObjectByName( 'Light_Oven_Glow' );
	if ( glowLight ) glowBase = glowLight.intensity;

	// the clock: a little screen over the display that's in the model
	const shown = room.getObjectByName( 'Oven_Temp_Display' );
	if ( shown ) {

		const canvas = document.createElement( 'canvas' );
		canvas.width = 256;
		canvas.height = 88;
		const texture = new THREE.CanvasTexture( canvas );
		texture.colorSpace = THREE.SRGBColorSpace;
		const box = new THREE.Box3().setFromObject( shown );
		const size = box.getSize( new THREE.Vector3() );
		const screen = new THREE.Mesh( new THREE.PlaneGeometry( size.x * 0.94, size.y * 0.9 ), new THREE.MeshBasicNodeMaterial( { map: texture } ) );
		screen.position.set( ( box.min.x + box.max.x ) / 2, ( box.min.y + box.max.y ) / 2, box.max.z + 0.0008 );
		room.add( screen );
		display = { canvas, texture };
		showOnDisplay( '180°' );

	}

}

// the opening, the cavity and the window
function makeInside( room, door, body ) {

	const doorBox = new THREE.Box3().setFromObject( door );
	const front = new THREE.Box3().setFromObject( body ).max.z;
	const back = new THREE.Box3().setFromObject( body ).min.z;
	const opening = { min: new THREE.Vector2( doorBox.min.x + 0.07, doorBox.min.y + 0.08 ), max: new THREE.Vector2( doorBox.max.x - 0.07, doorBox.max.y - 0.06 ) };

	// the front of the box isn't drawn where the opening is
	const inOpening = ( p, min, max ) => and( p.x.greaterThan( min.x ), p.x.lessThan( max.x ), p.y.greaterThan( min.y ), p.y.lessThan( max.y ) );
	body.material.maskNode = inOpening( positionWorld, opening.min, opening.max ).and( positionWorld.z.greaterThan( front - 0.01 ) ).not();
	body.material.needsUpdate = true;

	// the cavity: a box seen from inside, just behind the opening
	const width = opening.max.x - opening.min.x;
	const height = opening.max.y - opening.min.y;
	const depth = front - back - 0.06;
	cavityMaterial = new THREE.MeshStandardNodeMaterial( { color: 0x1e1410, roughness: 0.7, metalness: 0.2, emissive: 0xff7a2a, emissiveIntensity: 0.05, side: THREE.BackSide } );
	const cavity = new THREE.Mesh( new THREE.BoxGeometry( width, height, depth ), cavityMaterial );
	cavity.position.set( ( opening.min.x + opening.max.x ) / 2, ( opening.min.y + opening.max.y ) / 2, front - depth / 2 - 0.002 );
	cavity.receiveShadow = true;
	room.add( cavity );

	// the old glowing panel just behind the front would block the way in
	const glow = room.getObjectByName( 'Oven_Interior_Glow' );
	if ( glow ) glow.visible = false;

	// a see-through window: a hole in the door where the glass is, and the glass tinted
	const glass = room.getObjectByName( 'Oven_Door_Window' );
	if ( glass ) {

		room.updateMatrixWorld( true );
		const glassBox = new THREE.Box3().setFromObject( glass );
		const min = door.worldToLocal( glassBox.min.clone() );
		const max = door.worldToLocal( glassBox.max.clone() );
		const old = door.material;
		door.material = new THREE.MeshStandardNodeMaterial( { color: old.color, roughness: old.roughness, metalness: old.metalness, map: old.map } );
		door.material.maskNode = inOpening( positionLocal, min.min( max ), max.max( min ) ).not();

		glass.material = glass.material.clone();
		glass.material.color.set( 0x140c08 ); // dark smoked glass (the glow comes from inside now)
		glass.material.emissive?.set( 0x000000 );
		Object.assign( glass.material, { transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false } );

	}

}

export function openDoor( open = true ) {

	if ( ! hinge ) return Promise.resolve();
	const from = hinge.rotation.x;
	const to = open ? OPEN_ANGLE : 0;
	if ( from === to ) return Promise.resolve();
	return animate( 0.55, ( k ) => { hinge.rotation.x = THREE.MathUtils.lerp( from, to, ease( k ) ); } );

}

// heat 0 (off) .. 1 (baking); t: the time, for a little unsteadiness, like a real element
export function setHeat( heat, t = 0 ) {

	const flicker = heat > 0 ? 1 + Math.sin( t * 7 ) * Math.sin( t * 2.3 ) * 0.08 : 1;
	if ( glowLight ) glowLight.intensity = glowBase * ( 1 + ( HEAT - 1 ) * heat ) * flicker;
	if ( cavityMaterial ) cavityMaterial.emissiveIntensity = ( 0.05 + 0.35 * heat ) * flicker;

}

export function showOnDisplay( text, { warn = false } = {} ) {

	if ( ! display ) return;
	const g = display.canvas.getContext( '2d' );
	g.fillStyle = '#120806';
	g.fillRect( 0, 0, 256, 88 );
	g.fillStyle = warn ? '#ff4a2a' : '#ffae4a';
	g.font = 'bold 64px ui-monospace, Menlo, monospace';
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText( text, 128, 48 );
	display.texture.needsUpdate = true;

}
