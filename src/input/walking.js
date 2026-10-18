// walking around the room with the keyboard: the arrow keys (or W A S D) move the camera ahead,
// back, left and right along the floor, in the direction it's facing. The camera and what it looks
// at move together, so the view stays the same (and can still be turned with the mouse). It stays
// inside the room and can't go through the furniture: the player is a circle on the floor that
// bumps into the table, the counters, the oven and the tree (and slides along them if it walks
// into them at an angle), so it has to go round. Only while it's switched on (see enableWalking)
import * as THREE from 'three/webgpu';
import { camera, controls } from '../core/stage.js';
import { ROOM_MIN, ROOM_MAX } from '../core/config.js';
import { standingAt } from '../world/solids.js';

const SPEED = 1.3; // metres a second
const MARGIN = 0.2; // how close to a wall it can get
const EYE = 1.3; // how high the eyes are while walking
const LOOK_DOWN = THREE.MathUtils.degToRad( 28 ); // and how far down they look, so the table and counter are in view
const AHEAD = 0.8; // how far in front of the player their hand reaches
const RADIUS = 0.22; // how wide the player is (the floor space they take up)
const LOOK_AT = 0.4; // how far ahead the camera's look-at point is: turning the view turns the player on the spot

let blockedFor = 0; // how long the player has been pushing against something

const KEYS = {
	ArrowUp: 'ahead', w: 'ahead', W: 'ahead',
	ArrowDown: 'back', s: 'back', S: 'back',
	ArrowLeft: 'left', a: 'left', A: 'left',
	ArrowRight: 'right', d: 'right', D: 'right',
};

const down = { ahead: false, back: false, left: false, right: false };
const legend = document.getElementById( 'walk-keys' );
let enabled = false;

const ahead = new THREE.Vector3();
const side = new THREE.Vector3();
const UP = new THREE.Vector3( 0, 1, 0 );

// the view for walking about: eye height, looking ahead and down. It faces the way the camera
// faces now, and with `focus` (a spot on the floor to walk to) the player starts `back` metres
// behind it, so it's in view
export function walkPose( focus = null, back = 1.45 ) {

	camera.getWorldDirection( ahead ).setY( 0 );
	if ( ahead.lengthSq() < 1e-6 ) ahead.set( 0, 0, - 1 );
	ahead.normalize();

	const position = new THREE.Vector3( camera.position.x, EYE, camera.position.z );
	if ( focus ) {

		position.set( focus.x - ahead.x * back, EYE, focus.z - ahead.z * back );
		position.x = THREE.MathUtils.clamp( position.x, ROOM_MIN[ 0 ] + MARGIN, ROOM_MAX[ 0 ] - MARGIN );
		position.z = THREE.MathUtils.clamp( position.z, ROOM_MIN[ 2 ] + MARGIN, ROOM_MAX[ 2 ] - MARGIN );

	}

	const target = position.clone().addScaledVector( ahead, Math.cos( LOOK_DOWN ) * LOOK_AT );
	target.y -= Math.sin( LOOK_DOWN ) * LOOK_AT;
	return { position, target };

}

// where the player's hand reaches on the floor: a little way ahead of them
export function reachPoint( out = new THREE.Vector3() ) {

	camera.getWorldDirection( ahead ).setY( 0 );
	if ( ahead.lengthSq() < 1e-6 ) ahead.set( 0, 0, - 1 );
	return out.copy( camera.position ).addScaledVector( ahead.normalize(), AHEAD );

}

function show( key, pressed ) {

	down[ key ] = pressed;
	legend.querySelector( `[data-key="${ key }"]` )?.classList.toggle( 'down', pressed );

}

window.addEventListener( 'keydown', ( e ) => {

	const key = KEYS[ e.key ];
	if ( ! enabled || ! key || e.metaKey || e.ctrlKey || e.altKey ) return;
	e.preventDefault(); // (so the arrow keys don't scroll the page)
	show( key, true );

} );

window.addEventListener( 'keyup', ( e ) => {

	const key = KEYS[ e.key ];
	if ( key ) show( key, false );

} );

window.addEventListener( 'blur', () => Object.keys( down ).forEach( ( key ) => show( key, false ) ) );

export function enableWalking( on ) {

	enabled = on;
	legend.classList.toggle( 'show', on );
	if ( ! on ) Object.keys( down ).forEach( ( key ) => show( key, false ) );

	// walking: the mouse only turns the view (no zooming in or panning out of the room)
	controls.enableZoom = ! on;
	controls.enablePan = ! on;
	blockedFor = 0;

}

// the player is pushing against something right now
export function isBlocked() {

	return enabled && blockedFor > 0.2;

}

// how far a point is outside the room (0 inside it)
function outside( p ) {

	return Math.max( 0, ROOM_MIN[ 0 ] + MARGIN - p.x, p.x - ( ROOM_MAX[ 0 ] - MARGIN ), ROOM_MIN[ 2 ] + MARGIN - p.z, p.z - ( ROOM_MAX[ 2 ] - MARGIN ) );

}

// move the camera and its target together: not through the furniture (it slides along it), and
// not further out of the room (it can start right at a wall). The target isn't checked: the stage
// keeps it in the room. Returns whether it got anywhere
function tryMove( dx, dz ) {

	const to = standingAt( camera.position.clone().add( new THREE.Vector3( dx, 0, dz ) ), RADIUS );
	if ( outside( to ) > outside( camera.position ) ) return false;
	const shift = to.sub( camera.position ).setY( 0 );
	if ( shift.lengthSq() < 1e-10 ) return false;
	camera.position.add( shift );
	controls.target.add( shift );
	return true;

}

// every frame (paused while something else holds the camera, like the view moving to the oven)
export function updateWalking( dt ) {

	if ( ! enabled || ! controls.enabled ) return;

	// (turning the view moves the player a little, so they may end up in something: out they go)
	const settled = standingAt( camera.position, RADIUS );
	if ( settled.distanceToSquared( camera.position ) > 1e-10 ) {

		const shift = settled.sub( camera.position ).setY( 0 );
		camera.position.add( shift );
		controls.target.add( shift );

	}

	const forward = Number( down.ahead ) - Number( down.back );
	const sideways = Number( down.right ) - Number( down.left );
	if ( forward === 0 && sideways === 0 ) {

		blockedFor = 0;
		return;

	}

	// the way it's facing, flattened onto the floor
	camera.getWorldDirection( ahead ).setY( 0 );
	if ( ahead.lengthSq() < 1e-6 ) ahead.set( 0, 0, - 1 );
	ahead.normalize();
	side.crossVectors( ahead, UP );

	const step = new THREE.Vector3().addScaledVector( ahead, forward ).addScaledVector( side, sideways );
	step.normalize().multiplyScalar( SPEED * dt );

	// slides along a wall or a table instead of stopping dead
	const before = camera.position.clone();
	if ( ! tryMove( step.x, step.z ) ) {

		if ( ! tryMove( step.x, 0 ) ) tryMove( 0, step.z );

	}

	// pushing against something and getting nowhere much: it's in the way
	blockedFor = camera.position.distanceTo( before ) < SPEED * dt * 0.35 ? blockedFor + dt : 0;

}
