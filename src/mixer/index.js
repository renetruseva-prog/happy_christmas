// the mixing step: once every ingredient is in the bowl, a hand mixer pops up on the table and a
// card asks whether to mix with your hand (webcam) or the mouse. The mixer is held over the bowl:
// hold the mouse button and stir in circles, or move your hand in circles in front of the camera,
// until the ingredients have turned into dough. Esc puts it down (the mixing so far is kept).
//   model.js  the mixer's 3D model    intro.js  the camera-or-mouse card
//   swirl.js  telling stirring in circles apart from other movement
import * as THREE from 'three/webgpu';
import { getState, setState, subscribe } from '../state.js';
import { showStatus } from '../ui.js';
import { runSequence, ease, easeOutBack } from '../sequence.js';
import { loadMixed } from '../progress.js';
import { TABLE_TOP, thingsOnTable, clearance } from '../table.js';
import { bowlInfo, contentsTop, mixDough } from '../bowl/index.js';
import { preloadHandTracker } from '../handTracking.js';
import { HeldTool } from '../heldTool.js';
import { buildMixer } from './model.js';
import { showIntro, introShown } from './intro.js';
import { SwirlMeter } from './swirl.js';

const UP = new THREE.Vector3( 0, 1, 0 );
const TABLE_X = [ - 0.72, 0.72 ]; // where on the table it may lie (with a margin to the edges)
const TABLE_Z = [ - 0.5, 0.2 ];
const DIP = 0.012; // how deep the beaters reach into what's in the bowl

let room = null;
let camera = null;
let mixer = null; // { group, shaker, beaters, tipY } (see model.js)
let tool = null; // mouse / hand / camera button / tutorial (see heldTool.js)
const swirl = new SwirlMeter();

let rest = null; // where it lies on the table: { position, quaternion }
let running = false; // the motor is on (mouse button held, or a hand in front of the camera)
let progress = 0;
let spin = 0; // beater speed (radians per second)
let turned = 0; // how far the beaters have turned in total

const plane = new THREE.Plane();
const target = new THREE.Vector3();

// ---------- where it lies ----------
// a free spot next to the bowl, as far as possible from everything else on the table
function findRestSpot() {

	const { center } = bowlInfo();
	const things = thingsOnTable( room );
	let best = null;
	let bestRoom = - Infinity;

	for ( const reach of [ 0.24, 0.3, 0.36 ] ) {

		for ( let i = 0; i < 24; i ++ ) {

			const a = i / 24 * Math.PI * 2;
			const x = center.x + Math.cos( a ) * reach;
			const z = center.z + Math.sin( a ) * reach;
			if ( x < TABLE_X[ 0 ] || x > TABLE_X[ 1 ] || z < TABLE_Z[ 0 ] || z > TABLE_Z[ 1 ] ) continue;
			const free = clearance( things, x, z );
			if ( free > bestRoom ) {

				bestRoom = free;
				best = new THREE.Vector3( x, 0, z );

			}

		}

	}

	return best ?? new THREE.Vector3( center.x + 0.3, 0, center.z );

}

// lying on its side, beaters pointing at the bowl, its lowest point on the table
function restPose( spot ) {

	const { center } = bowlInfo();
	const toBowl = new THREE.Vector3( center.x - spot.x, 0, center.z - spot.z ).normalize();
	const quaternion = new THREE.Quaternion().setFromAxisAngle( UP, Math.atan2( - toBowl.x, - toBowl.z ) )
		.multiply( new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 1, 0, 0 ), Math.PI / 2 ) );

	const { group } = mixer;
	group.position.copy( spot );
	group.quaternion.copy( quaternion );
	group.scale.setScalar( 1 );
	group.updateMatrixWorld( true );
	const lift = TABLE_TOP - new THREE.Box3().setFromObject( group ).min.y;
	return { position: spot.clone().setY( lift ), quaternion };

}

// upright over the bowl, turned so the camera sees it from the side
function uprightPose() {

	const { center } = bowlInfo();
	const toCamera = new THREE.Vector3().subVectors( camera.position, center );
	return new THREE.Quaternion().setFromAxisAngle( UP, Math.atan2( toCamera.x, toCamera.z ) );

}

// the mixer's middle when its beaters dip into the bowl at (x, z)
function mixingHeight( x, z ) {

	return contentsTop( x, z ) - DIP - mixer.tipY;

}

// fly it from where it is to a pose, along a small arc
function moveTo( position, quaternion ) {

	const { group } = mixer;
	const fromP = group.position.clone();
	const fromQ = group.quaternion.clone();
	return runSequence( [ {
		duration: 0.6,
		update: ( k ) => {

			group.position.lerpVectors( fromP, position, ease( k ) );
			group.position.y += Math.sin( Math.PI * k ) * 0.08;
			group.quaternion.slerpQuaternions( fromQ, quaternion, ease( k ) );

		},
	} ] );

}

// where the hand steers the mixer: the middle of the camera picture is the middle of the bowl;
// moving the hand across the middle 60% of the picture covers the bowl. Right is right on
// screen and up is away from you, so it moves the way you'd expect.
function handTarget( hand, center, reach ) {

	const right = new THREE.Vector3().setFromMatrixColumn( camera.matrixWorld, 0 ).setY( 0 ).normalize();
	const away = new THREE.Vector3().crossVectors( UP, right ).normalize();
	const sx = THREE.MathUtils.clamp( ( hand.x - 0.5 ) / 0.3, - 1, 1 );
	const sy = THREE.MathUtils.clamp( ( 0.5 - hand.y ) / 0.3, - 1, 1 );
	const offset = right.multiplyScalar( sx * reach ).add( away.multiplyScalar( sy * reach ) ).clampLength( 0, reach );
	return new THREE.Vector3( center.x + offset.x, 0, center.z + offset.z );

}

// ---------- the steps ----------
function appear( instantly = false ) {

	rest = restPose( findRestSpot() );
	mixer.group.position.copy( rest.position );
	mixer.group.quaternion.copy( rest.quaternion );
	mixer.group.visible = true;
	preloadHandTracker().catch( () => {} ); // so "mix with your hand" starts quickly (no camera yet)
	if ( instantly ) return;

	// pops up with a little bounce
	runSequence( [ {
		duration: 0.6,
		update: ( k ) => {

			mixer.group.scale.setScalar( Math.max( easeOutBack( k ), 0.001 ) );
			mixer.group.position.y = rest.position.y + ( 1 - ease( k ) ) * 0.06;

		},
	} ] );

}

function available() {

	const { mixed, mixing, busy, held } = getState();
	return mixer.group.visible && ! mixed && ! mixing && ! busy && ! held && ! introShown();

}

async function grab() {

	setState( { mixing: true } );
	tool.lockView();

	const { center } = bowlInfo();
	const over = new THREE.Vector3( center.x, mixingHeight( center.x, center.z ), center.z );
	mixDough( progress, turned ); // the dough starts (from nothing) the first time
	await moveTo( over, uprightPose() );

	target.copy( over );
	swirl.reset();
	await tool.begin();
	showStatus( `Mixing the dough · ${ Math.round( progress * 100 ) }%` );

}

async function putDown() {

	tool.end();
	running = false;
	await moveTo( rest.position, rest.quaternion );
	tool.unlockView();
	setState( { mixing: false } );

}

async function finish() {

	mixDough( 1, turned );
	setState( { mixed: true } );
	await putDown();

}

// ---------- hooks for interaction.js ----------
// the hover hint: { text, clickable }, false to show nothing, null if it's not about the mixer
export function mixerHint( ray ) {

	if ( ! mixer ) return null;
	if ( introShown() ) return false; // the "time to mix" card is up
	if ( tool.holding ) return tool.hint( running );
	if ( getState().mixing ) return false; // on its way to or from the bowl
	if ( ! mixer.group.visible || ray.intersectObject( mixer.group, true ).length === 0 ) return null;
	if ( getState().mixed ) return { text: 'Hand Mixer · the dough is mixed', clickable: false };
	return { text: 'Hand Mixer · pick up and mix the dough', clickable: available() };

}

// a click: if it's on the mixer, pick the mixer up
export function tryGrabMixer( ray ) {

	if ( ! mixer || ! available() || ray.intersectObject( mixer.group, true ).length === 0 ) return false;
	grab();
	return true;

}

// ---------- setup and every frame ----------
export function initMixer( { scene, room: kitchen, camera: cam, controls, canvas } ) {

	room = kitchen;
	camera = cam;
	mixer = buildMixer();
	mixer.group.visible = false;
	scene.add( mixer.group );

	tool = new HeldTool( {
		camera,
		controls,
		canvas,
		verb: 'Mix',
		guide: {
			motion: 'circle',
			hand: { text: 'Move your hand in circles in front of the camera', small: 'Just showing your hand won\'t mix it, keep going round!' },
			mouse: { text: 'Hold the mouse button and move in circles over the bowl', small: 'Keep going round: holding still won\'t mix it' },
		},
		hints: {
			handMoving: 'keep moving your hand in circles',
			handMissing: 'show your hand to the camera · Esc to put the mixer down',
			mouseOn: 'keep moving in circles',
			mouseOff: 'hold the mouse button and move in circles · C to use your hand · Esc to put it down',
		},
		progress: () => progress,
		onEscape: putDown,
	} );

	const allIn = ( { inBowl, total } ) => total > 0 && inBowl.length === total;

	// mixed before a page refresh: the dough is ready and the mixer lies on the table
	if ( allIn( getState() ) && loadMixed() ) {

		progress = 1;
		mixDough( 1 );
		appear( true );
		setState( { mixed: true } );
		return;

	}

	// as soon as everything is in the bowl: the mixer appears and the card asks camera or mouse
	const ready = () => {

		appear();
		setTimeout( () => showIntro( grab ), 700 ); // after the mixer has popped up

	};

	if ( allIn( getState() ) ) ready();
	else {

		const stop = subscribe( ( state ) => {

			if ( ! allIn( state ) || mixer.group.visible ) return;
			stop();
			ready();

		} );

	}

}

export function updateMixer( dt ) {

	if ( ! mixer ) return;

	// the beaters speed up when it's switched on and slow down when it's off
	spin += ( ( running ? 45 : 0 ) - spin ) * ( 1 - Math.exp( - dt * ( running ? 6 : 2.5 ) ) );
	turned += spin * dt;
	for ( const { beater, direction } of mixer.beaters ) beater.rotation.y += direction * spin * dt;
	mixer.shaker.position.set( ( Math.random() - 0.5 ) * 0.0025, ( Math.random() - 0.5 ) * 0.0015, ( Math.random() - 0.5 ) * 0.0025 ).multiplyScalar( spin / 45 );

	if ( ! tool.holding ) return;

	// it follows your hand (camera) or the mouse around the inside of the bowl, kept away from the wall
	const { center, rimY, radius } = bowlInfo();
	const hand = tool.hand();

	if ( hand ) target.copy( handTarget( hand, center, radius * 0.45 ) );
	else if ( ! tool.usingCamera() ) {

		plane.set( UP, - rimY );
		if ( tool.pointerOn( plane, target ) ) {

			const offset = new THREE.Vector3( target.x - center.x, 0, target.z - center.z ).clampLength( 0, radius * 0.45 );
			target.set( center.x + offset.x, 0, center.z + offset.z );

		}

	}

	// on while the mouse button is held or a hand is in front of the camera
	running = tool.mouseDown || hand !== null;

	const { group } = mixer;
	const from = group.position.clone();
	const follow = 1 - Math.exp( - dt * 10 );
	group.position.x += ( target.x - from.x ) * follow;
	group.position.z += ( target.z - from.z ) * follow;
	group.position.y = mixingHeight( group.position.x, group.position.z );

	// it only mixes while it's on AND going round in circles (see swirl.js)
	const gained = swirl.measure( { center, radius, from, to: group.position, target, dt, on: running } );
	progress = Math.min( 1, progress + gained );
	tool.updateGuide( gained, dt );

	mixDough( progress, turned * 0.02 );
	showStatus( `Mixing the dough · ${ Math.round( progress * 100 ) }%` );
	if ( progress >= 1 ) finish();

}
