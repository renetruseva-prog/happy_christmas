// the decorating things on the table, from the kitchen model: the piping bag, the bowl of
// chocolate chips and the bowl of sprinkles. When the decorating starts they're set out next to
// the tray. Pick one up and it follows the mouse over the cookies:
//   the piping bag hangs nozzle down just over them; holding the mouse squeezes it (the icing
//   comes out of the nozzle, see icing.js)
//   a bowl hovers over them; holding the mouse tips it over and the chips or sprinkles pour out
//   over its lip (see pieces.js), right over the mouse
// Putting it down takes it back to its place on the table.
import * as THREE from 'three/webgpu';
import { animate, ease } from '../sequence.js';

const UP = new THREE.Vector3( 0, 1, 0 );
const X = new THREE.Vector3( 1, 0, 0 );

// where they're set out, next to the tray (their middles on the table), and how they're turned
const SPOTS = {
	icing: { at: new THREE.Vector3( 0.1, 0, - 0.21 ), turn: 0.05 }, // (behind the tray, along it)
	sprinkles: { at: new THREE.Vector3( 0.42, 0, - 0.05 ), turn: 0.39 },
	chips: { at: new THREE.Vector3( 0.42, 0, 0.15 ), turn: 0.39 },
};
const NAMES = { icing: 'Piping_Bag', chips: 'Chips_Bowl', sprinkles: 'Sprinkles_Bowl' };

const HOVER = 0.03; // the nozzle's tip, over the cookie
const PUSH = 0.24; // how fast icing comes out of the nozzle (see icing.js)
const LIFT = 0.1; // a bowl's middle, over the cookie
const TIP_IDLE = 0.15; // how far a bowl is tipped while it's held
const TIP_POUR = 1.1; // and while it's pouring

export const props = {}; // name → { object, home: { position, quaternion }, ... }
let held = null; // the name of the one in the hand
let carry = 0; // 0 on the table .. 1 in the hand (it's picked up and put down smoothly)
let moving = null; // the pick up or put down in progress
let squeeze = 0; // the piping bag being squeezed (0..1)
let tip = TIP_IDLE;
const lastTip = new THREE.Vector3();
let tipKnown = false;

// ---------- setting up ----------
export function initProps( room ) {

	room.updateMatrixWorld( true );
	for ( const [ name, node ] of Object.entries( NAMES ) ) {

		const object = room.getObjectByName( node );
		if ( ! object ) continue;
		const prop = { name, object, home: { position: object.position.clone(), quaternion: object.quaternion.clone() } };

		if ( name === 'icing' ) {

			// the nozzle's very tip, along the bag (its local x)
			const nozzle = object.getObjectByName( 'Piping_Bag_Nozzle' );
			nozzle.geometry.computeBoundingBox();
			const box = nozzle.geometry.boundingBox;
			prop.tip = new THREE.Vector3( box.max.x, ( box.min.y + box.max.y ) / 2, ( box.min.z + box.max.z ) / 2 ).applyMatrix4( nozzle.matrix );
			prop.filling = object.getObjectByName( 'Piping_Bag_Icing' );
			if ( prop.filling ) prop.filling.material = prop.filling.material.clone();

		} else {

			// the bowl's rim, in its own coordinates
			object.geometry.computeBoundingBox();
			const box = object.geometry.boundingBox;
			prop.rim = { centre: box.getCenter( new THREE.Vector3() ).setY( box.max.y ), radius: ( box.max.x - box.min.x ) / 2 * 0.9, bottom: box.min.y };
			// (the chips lying next to the bowl stay where they are: they'd be left floating)
			for ( const chip of object.children.filter( ( c ) => c.name.startsWith( 'Chocolate_Chip_Spilled' ) ) ) chip.visible = false;

		}

		props[ name ] = prop;

	}

}

// the pose they're set out in, next to the tray (tableTop: the table's height)
function setOutPose( name, tableTop ) {

	const { object, home } = props[ name ];
	const box = new THREE.Box3().setFromObject( object );
	const spot = SPOTS[ name ];
	const position = new THREE.Vector3( spot.at.x, home.position.y - ( box.min.y - tableTop ), spot.at.z );
	const centre = box.getCenter( new THREE.Vector3() );
	position.x += home.position.x - centre.x; // (its middle on the spot, not its origin)
	position.z += home.position.z - centre.z;
	return { position, quaternion: new THREE.Quaternion().setFromAxisAngle( UP, spot.turn ) };

}

// set them out next to the tray (instantly: no gliding over)
export function setOut( tableTop, { instantly = false } = {} ) {

	const moves = Object.keys( props ).map( ( name ) => {

		const { object } = props[ name ];
		const to = setOutPose( name, tableTop );
		props[ name ].home = to;
		if ( instantly ) {

			object.position.copy( to.position );
			object.quaternion.copy( to.quaternion );
			return null;

		}

		const from = { position: object.position.clone(), quaternion: object.quaternion.clone() };
		return animate( 1.0, ( k ) => {

			object.position.lerpVectors( from.position, to.position, ease( k ) );
			object.position.y += Math.sin( Math.PI * k ) * 0.08;
			object.quaternion.slerpQuaternions( from.quaternion, to.quaternion, ease( k ) );

		} );

	} );

	return Promise.all( moves );

}

// ---------- in the hand ----------
export function heldProp() {

	return held;

}

export function isPropObject( name, object ) {

	let o = object;
	while ( o ) {

		if ( o === props[ name ]?.object ) return true;
		o = o.parent;

	}

	return false;

}

export function pickUp( name ) {

	if ( ! props[ name ] || held === name ) return;
	if ( held ) sendHome( props[ held ] ); // (swapping: the other one goes back)
	held = name;
	carry = 0;
	tipKnown = false;
	moving = 'up';

}

// back to its place on the table, from wherever it is
function sendHome( { object, home } ) {

	const from = { position: object.position.clone(), quaternion: object.quaternion.clone() };
	object.scale.setScalar( 1 );
	return animate( 0.4, ( k ) => {

		object.position.lerpVectors( from.position, home.position, ease( k ) );
		object.quaternion.slerpQuaternions( from.quaternion, home.quaternion, ease( k ) );

	} );

}

export function putDown() {

	if ( ! held ) return;
	moving = 'down';

}

// the icing's colour, in the bag
export function setIcingColor( color ) {

	props.icing?.filling?.material.color.set( color );

}

const ONE = new THREE.Vector3( 1, 1, 1 );
const pose = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), matrix: new THREE.Matrix4() };

// the lowest point of a bowl's rim, with the bowl at `matrix`
function lowestRim( prop, matrix ) {

	const lip = new THREE.Vector3();
	const p = new THREE.Vector3();
	let lowest = Infinity;
	for ( let i = 0; i < 24; i ++ ) {

		const a = i / 24 * Math.PI * 2;
		p.set( Math.cos( a ) * prop.rim.radius, 0, Math.sin( a ) * prop.rim.radius ).add( prop.rim.centre ).applyMatrix4( matrix );
		if ( p.y < lowest ) {

			lowest = p.y;
			lip.copy( p );

		}

	}

	return lip;

}
const out = new THREE.Vector3();
const toward = new THREE.Vector3();
const tilt = new THREE.Quaternion();

// every frame: point (where the mouse is over the cookies, or null), pressing (the mouse button),
// camera; returns what it's doing: { squeezing: { tip, out, moving } } or { pouring: { amount, lip } }
export function updateProps( dt, { point, pressing, camera } ) {

	if ( ! held ) return {};
	const prop = props[ held ];
	const { object } = prop;

	// picked up / put down: glides between the table and the hand
	if ( moving === 'up' ) carry = Math.min( 1, carry + dt * 3 );
	if ( moving === 'down' ) carry = Math.max( 0, carry - dt * 3 );
	if ( carry === 1 && moving === 'up' ) moving = null;
	if ( carry === 0 && moving === 'down' ) {

		object.position.copy( prop.home.position );
		object.quaternion.copy( prop.home.quaternion );
		object.scale.setScalar( 1 );
		held = null;
		moving = null;
		return {};

	}

	// the way to the player, along the table
	toward.copy( camera.position ).sub( point ?? object.position ).setY( 0 ).normalize();
	const at = point ?? object.position;
	const using = carry === 1 && point !== null && pressing;

	if ( held === 'icing' ) {

		// nozzle down, its tip just over the cookie, leaning away from the player (so the bag
		// doesn't hide the tip)
		squeeze += ( ( using ? 1 : 0 ) - squeeze ) * ( 1 - Math.exp( - dt * 14 ) );
		out.set( 0, - 1, 0 ).addScaledVector( toward, 0.4 ).normalize();
		pose.quaternion.setFromUnitVectors( X, out );
		// the icing comes out the way the nozzle points and then falls, so it lands a little ahead of
		// the tip: the tip is held back by exactly that much, for it to land right under the mouse
		const vy = out.y * PUSH;
		const fall = ( - vy + Math.sqrt( vy * vy + 2 * 9.81 * HOVER ) ) / 9.81;
		pose.position.copy( at ).addScaledVector( UP, HOVER ).addScaledVector( new THREE.Vector3( out.x, 0, out.z ), - PUSH * fall ).sub( prop.tip.clone().applyQuaternion( pose.quaternion ) );
		object.scale.set( 1, 1 - squeeze * 0.07, 1 - squeeze * 0.07 ); // (squashed in the hand)

	} else {

		// over the mouse, tipping towards the player to pour (its lip right over the mouse)
		tip += ( ( using ? TIP_POUR : TIP_IDLE ) - tip ) * ( 1 - Math.exp( - dt * 5 ) );
		tilt.setFromAxisAngle( new THREE.Vector3().crossVectors( UP, toward ).normalize(), tip );
		pose.quaternion.copy( tilt ).multiply( prop.home.quaternion );
		pose.position.copy( at ).addScaledVector( UP, LIFT );

		// then moved so the lowest point of its rim (where it pours) is right over the mouse
		pose.matrix.compose( pose.position, pose.quaternion, ONE );
		const lowest = lowestRim( prop, pose.matrix );
		pose.position.x += at.x - lowest.x;
		pose.position.z += at.z - lowest.z;

	}

	// (blended with where it lies on the table while it's being picked up or put down)
	const k = ease( carry );
	const follow = 1; // (right on the mouse: where it's aimed is where it lands)
	const target = pose.position.clone().lerp( prop.home.position, 1 - k );
	target.y += Math.sin( Math.PI * k ) * 0.05;
	object.position.lerp( target, follow );
	object.quaternion.slerp( new THREE.Quaternion().slerpQuaternions( prop.home.quaternion, pose.quaternion, k ), follow );
	object.updateMatrixWorld( true );

	if ( held === 'icing' ) {

		const tipNow = prop.tip.clone().applyMatrix4( object.matrixWorld );
		const velocity = tipKnown ? tipNow.clone().sub( lastTip ).divideScalar( Math.max( dt, 1e-4 ) ) : new THREE.Vector3();
		lastTip.copy( tipNow );
		tipKnown = true;
		if ( squeeze < 0.3 || carry < 1 ) return { holding: 'icing' };
		return { holding: 'icing', squeezing: { tip: tipNow, out: X.clone().applyQuaternion( object.quaternion ), moving: velocity.clampLength( 0, 1.5 ) } };

	}

	// pouring: how much (0 not yet .. 1 full), and the lowest point of the rim, where it pours from
	const amount = THREE.MathUtils.smoothstep( tip, 0.6, TIP_POUR );
	if ( amount <= 0 || carry < 1 ) return { holding: held };
	const lip = lowestRim( prop, object.matrixWorld );

	return { holding: held, pouring: { amount, lip, toward: toward.clone() } };

}
