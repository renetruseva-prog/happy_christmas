// the oven's temperature knob (the left one on its panel): drag it to turn the heat between
// MIN and MAX degrees. A white line on it shows where it points: straight up is the middle,
// turned right (clockwise) is hotter
import * as THREE from 'three/webgpu';

export const MIN = 150;
export const MAX = 250;
export const NORMAL = 180; // the temperature the baking times are for
const SWING = THREE.MathUtils.degToRad( 135 ); // how far it turns each way from the middle
const PER_PIXEL = 0.35; // degrees of heat per pixel the mouse moves

let knob = null;
let base = null; // how it sits in the model, turned to point straight up
let temperature = NORMAL;

export function initKnob( room ) {

	knob = room.getObjectByName( 'Oven_Knob_0_Baked' );
	if ( ! knob ) return;
	base = knob.quaternion.clone();

	// the line: on its front face (in the knob's own coordinates its axis is y, and -z is up)
	const line = new THREE.Mesh( new THREE.BoxGeometry( 0.004, 0.002, 0.02 ), new THREE.MeshBasicNodeMaterial( { color: 0xfff3e6 } ) );
	line.position.set( 0, 0.0185, - 0.011 );
	knob.add( line );

}

export function hitsKnob( ray ) {

	return knob !== null && ray.intersectObject( knob, true ).length > 0;

}

export function getTemperature() {

	return temperature;

}

// 0 at the coolest .. 1 at the hottest
export function heatLevel() {

	return ( temperature - MIN ) / ( MAX - MIN );

}

// how much faster than normal the cookies bake at this temperature
export function bakeSpeed( t = temperature ) {

	return 1 + ( t - NORMAL ) / 100;

}

export function setTemperature( t ) {

	temperature = THREE.MathUtils.clamp( t, MIN, MAX );
	if ( ! knob ) return;
	const angle = THREE.MathUtils.lerp( SWING, - SWING, heatLevel() ); // (clockwise is hotter)
	knob.quaternion.copy( base ).multiply( new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), angle ) );

}

// the mouse moved (dx, dy) pixels while dragging the knob: right or up is hotter
export function turnKnob( dx, dy ) {

	setTemperature( temperature + ( dx - dy ) * PER_PIXEL );

}

// what it shows: rounded to 5 degrees, like a real oven
export function shownTemperature() {

	return Math.round( temperature / 5 ) * 5;

}
