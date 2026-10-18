// carrying the cookies to the tray, one by one: the mouse is a hand, you can only reach a cookie
// (or the tray) when you're close to it, and the cookie in the hand is held under it. The baking
// step (index.js) decides what a click does; this is what carrying looks like and where it goes
import * as THREE from 'three/webgpu';
import { getState, setState } from '../core/state.js';
import { animate, ease } from '../core/sequence.js';
import { cuts } from '../cutting/cuts.js';
import { slotPosition } from './tray.js';
import { reachPoint } from '../input/walking.js';

const UP = new THREE.Vector3( 0, 1, 0 );
const REACH = 0.45; // how close a cookie has to be to where the hand reaches (see walking.js) to pick it up
const TRAY_REACH = 0.5; // and the tray, to put one on it
const HOLD_SCALE = 1.4; // a carried cookie is a bit bigger, so it can be seen
export const ROUNDING = 0.0015; // a cookie's middle is this far over what it lies on (see cutting/cuts.js)

// a cookie lying flat (as cut: see cutting/cuts.js), and how far it's tilted up towards the
// player while it's held, so the face of it shows
const FLAT = new THREE.Quaternion().setFromEuler( new THREE.Euler( - Math.PI / 2, 0, 0 ) );
const HOLD_TILT = 0.95;
const tilted = new THREE.Quaternion();
const towards = new THREE.Vector3();
const at = new THREE.Vector3();
const reach = new THREE.Vector3();
const floorAt = new THREE.Vector3();

let camera = null;
let tray = null; // see tray.js
let hand3d = null; // the player's hand (see hand.js)
let pointer = null; // where the mouse is, and the ray through it (shared with index.js)
let raycaster = null;
let carrying = null; // the cookie in the hand: { cookie, index }

export function initCarrying( { camera: cam, tray: bakingTray, hand, pointer: mouse, raycaster: ray } ) {

	camera = cam;
	tray = bakingTray;
	hand3d = hand;
	pointer = mouse;
	raycaster = ray;

}

// the cookie in the hand ({ cookie, index }), or null
export function carried() {

	return carrying;

}

// the cookies still on the dough
export function looseCookies() {

	const { onTray } = getState();
	return cuts.filter( ( c, i ) => ! onTray.includes( i ) ).map( ( c ) => c.cookie );

}

// how far apart two things are along the floor
function flat( a, b ) {

	return Math.hypot( a.x - b.x, a.z - b.z );

}

export function nearCookie( cookie ) {

	return flat( reachPoint( reach ), cookie.getWorldPosition( at ) ) < REACH;

}

export function nearTray() {

	return flat( reachPoint( reach ), tray.centre ) < TRAY_REACH;

}

// fly a cookie to `to` along an arc, back to its own size and lying flat
function flyCookie( cookie, to, duration = 0.5 ) {

	const from = cookie.position.clone();
	const fromQ = cookie.quaternion.clone();
	const size = cookie.scale.x;
	return animate( duration, ( k ) => {

		cookie.position.lerpVectors( from, to, ease( k ) );
		cookie.position.y += Math.sin( Math.PI * k ) * 0.12;
		cookie.scale.setScalar( THREE.MathUtils.lerp( size, 1, ease( k ) ) );
		cookie.quaternion.slerpQuaternions( fromQ, FLAT, ease( k ) );

	} );

}

export function pickUp( cookie ) {

	carrying = { cookie, index: cuts.findIndex( ( c ) => c.cookie === cookie ) };

}

// put it back on the dough where it was cut
export function putBackCarried() {

	const { cookie } = carrying;
	carrying = null;
	flyCookie( cookie, cookie.userData.cutAt, 0.6 );

}

// onto the tray, in the next free place
export async function placeCarried() {

	const { cookie, index } = carrying;
	carrying = null;

	const onTray = [ ...getState().onTray, index ];
	setState( { onTray } );
	const to = slotPosition( tray, onTray.length - 1 ).add( new THREE.Vector3( 0, ROUNDING, 0 ) );
	await flyCookie( cookie, to, 0.6 );
	tray.mesh.attach( cookie ); // it goes where the tray goes now

}

// the cookie in the hand is held under it
export function followHand( dt ) {

	const { cookie } = carrying;
	hand3d.holdPoint( at );
	const k = 1 - Math.exp( - dt * 30 );
	cookie.position.lerp( at, k );
	cookie.scale.setScalar( THREE.MathUtils.lerp( cookie.scale.x, HOLD_SCALE, k ) );

	// tilted up towards the player
	towards.subVectors( camera.position, cookie.position ).setY( 0 ).normalize();
	tilted.setFromAxisAngle( towards.cross( UP ).negate().normalize(), HOLD_TILT ).multiply( FLAT );
	cookie.quaternion.slerp( tilted, k );

}

// where the hand is: on whatever the mouse points at, or on the table or counter below it. null
// when the mouse is off the page (or a card is open), so the hand isn't drawn
export function handPoint() {

	if ( Math.abs( pointer.x ) > 1 || Math.abs( pointer.y ) > 1 || document.querySelector( '.overlay.show' ) ) return null;

	raycaster.setFromCamera( pointer, camera );
	const things = [ tray.mesh, ...looseCookies().filter( ( c ) => c !== carrying?.cookie ) ];
	const hit = raycaster.intersectObjects( things, true )[ 0 ];
	if ( hit ) return hit.point;

	// the table, or the counter along the back wall
	for ( const y of [ 0.8, 0.92 ] ) {

		if ( raycaster.ray.intersectPlane( new THREE.Plane( UP, - y ), floorAt ) && ( y === 0.92 || floorAt.z > - 1.35 ) ) break;

	}

	// not too far away (or a ray that never reaches the floor)
	if ( floorAt.distanceTo( camera.position ) > 1.8 || raycaster.ray.direction.y > - 0.02 ) floorAt.copy( raycaster.ray.origin ).addScaledVector( raycaster.ray.direction, 1.2 );
	return floorAt;

}
