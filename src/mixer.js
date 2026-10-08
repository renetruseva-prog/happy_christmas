// the hand mixer: it pops up on the table once every ingredient is in the bowl. Click it to hold
// it over the bowl, then hold the mouse button to switch it on and stir in circles until the
// ingredients turn into dough. Or press C to stir with your real hand in front of the webcam.
// Esc puts it down again (the mixing done so far is kept).
import * as THREE from 'three/webgpu';
import { MIX_DISTANCE, MIN_SWIRL } from './config.js';
import { getState, setState, subscribe } from './state.js';
import { showStatus, showGuide, hideGuide, guideShown } from './ui.js';
import { runSequence } from './sequence.js';
import { loadMixed } from './progress.js';
import { bowlInfo, contentsTop, mixDough } from './pouring.js';
import { preloadHandTracker, startHandTracking, stopHandTracking, updateHandTracking, isTracking, handPosition } from './handTracking.js';

const UP = new THREE.Vector3( 0, 1, 0 );
const TABLE_TOP = 0.78; // height of the table's surface
const TABLE_X = [ - 0.72, 0.72 ]; // where on the table it may lie (with a margin to the edges)
const TABLE_Z = [ - 0.5, 0.2 ];
const DIP = 0.012; // how deep the beaters reach into what's in the bowl

const ease = ( k ) => k * k * ( 3 - 2 * k );
const easeOutBack = ( k ) => 1 + 2.2 * ( k - 1 ) ** 3 + 1.2 * ( k - 1 ) ** 2; // overshoots a little, then settles

let room = null;
let camera = null;
let controls = null;
let mixer = null; // the whole mixer (moves and turns)
let shaker = null; // everything inside it: shakes while the motor runs
const beaters = [];
let tipY = 0; // how far the beater tips reach below the mixer's middle

let rest = null; // where it lies on the table: { position, quaternion }
let holding = false; // over the bowl, ready to mix
let running = false; // the motor is on (mouse button held, or a hand in front of the camera)
let mouseDown = false;
// how far the mixer turned around the middle of the bowl, frame by frame, over the last couple
// of seconds: going round adds up, going back and forth cancels itself out
const SWIRL_WINDOW = 2;
const turns = [];
let clock = 0;
const lastTarget = new THREE.Vector3(); // where the mouse/hand pointed last frame
const cameraButton = document.getElementById( 'camera-btn' );

// the "time to mix" card and the little tutorial (see index.html)
const intro = document.getElementById( 'mix-intro' );
const introNote = document.getElementById( 'mix-intro-note' );
const useCameraButton = document.getElementById( 'use-camera' );
const useMouseButton = document.getElementById( 'use-mouse' );
let tutorialFrom = 0; // progress when the tutorial last showed: it hides once you've mixed a bit
let stillFor = 0; // seconds without any mixing progress: the tutorial comes back
let progress = 0;
let spin = 0; // beater speed (radians per second)
let turned = 0; // how far the beaters have turned in total

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2( 2, 2 );
const plane = new THREE.Plane();
const target = new THREE.Vector3();

// ---------- the model: a red hand mixer with a handle and two whisk beaters ----------
function buildMixer() {

	const red = new THREE.MeshPhysicalNodeMaterial( { color: 0xb3202a, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 } );
	const cream = new THREE.MeshStandardNodeMaterial( { color: 0xf2ece0, roughness: 0.5 } );
	const steel = new THREE.MeshStandardNodeMaterial( { color: 0xd4d4d6, metalness: 0.7, roughness: 0.25 } );

	const group = new THREE.Group();
	group.name = 'Hand_Mixer';
	shaker = new THREE.Group();
	group.add( shaker );

	const add = ( geometry, material, x = 0, y = 0, z = 0 ) => {

		const mesh = new THREE.Mesh( geometry, material );
		mesh.position.set( x, y, z );
		mesh.castShadow = mesh.receiveShadow = true;
		shaker.add( mesh );
		return mesh;

	};

	// body: a rounded capsule lying along x, a cream cap at the front
	const body = add( new THREE.CapsuleGeometry( 0.032, 0.11, 8, 20 ), red );
	body.rotation.z = Math.PI / 2;
	body.scale.set( 1, 1, 0.85 );
	add( new THREE.CylinderGeometry( 0.026, 0.026, 0.012, 24 ), cream, 0.083, 0, 0 ).rotation.z = Math.PI / 2;

	// handle: an arch over the body, with the speed switch in front of it
	add( new THREE.TorusGeometry( 0.042, 0.011, 12, 32, Math.PI ), red, - 0.012, 0.022, 0 );
	add( new THREE.BoxGeometry( 0.018, 0.008, 0.012 ), cream, 0.042, 0.03, 0 );

	// two beaters under the front of the body; each spins around its own shaft, in opposite directions
	for ( const [ x, direction ] of [ [ 0.018, 1 ], [ 0.052, - 1 ] ] ) {

		const beater = new THREE.Group();
		beater.position.set( x, - 0.025, 0 );
		shaker.add( beater );

		const shaft = new THREE.Mesh( new THREE.CylinderGeometry( 0.0025, 0.0025, 0.08, 8 ), steel );
		shaft.position.y = - 0.04;
		beater.add( shaft );

		// the whisk: four upright wire loops around the shaft
		for ( let i = 0; i < 4; i ++ ) {

			const loop = new THREE.Mesh( new THREE.TorusGeometry( 0.012, 0.0014, 6, 24 ), steel );
			loop.scale.set( 1, 1.5, 1 );
			loop.rotation.y = i * Math.PI / 4;
			loop.position.y = - 0.082;
			beater.add( loop );

		}

		beater.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = true; } );
		beaters.push( { beater, direction } );

	}

	group.updateMatrixWorld( true );
	tipY = new THREE.Box3().setFromObject( group ).min.y;
	return group;

}

// ---------- where it lies on the table ----------
// a free spot next to the bowl, as far as possible from everything else on the table
function findRestSpot() {

	const { center } = bowlInfo();
	const things = [];
	room.traverse( ( o ) => {

		if ( ! o.isMesh || o.userData.baked || ! o.visible ) return;
		const c = new THREE.Box3().setFromObject( o ).getCenter( new THREE.Vector3() );
		if ( c.y > TABLE_TOP - 0.02 && c.y < TABLE_TOP + 0.3 ) things.push( c );

	} );

	let best = null;
	let bestRoom = - Infinity;
	for ( const reach of [ 0.24, 0.3, 0.36 ] ) {

		for ( let i = 0; i < 24; i ++ ) {

			const a = i / 24 * Math.PI * 2;
			const x = center.x + Math.cos( a ) * reach;
			const z = center.z + Math.sin( a ) * reach;
			if ( x < TABLE_X[ 0 ] || x > TABLE_X[ 1 ] || z < TABLE_Z[ 0 ] || z > TABLE_Z[ 1 ] ) continue;
			const free = things.reduce( ( m, t ) => Math.min( m, Math.hypot( x - t.x, z - t.z ) ), 1 );
			if ( free > bestRoom ) {

				bestRoom = free;
				best = new THREE.Vector3( x, 0, z );

			}

		}

	}

	return best ?? new THREE.Vector3( center.x + 0.3, 0, center.z );

}

// lying on its side, beaters pointing at the bowl
function restPose( spot ) {

	const { center } = bowlInfo();
	const toBowl = new THREE.Vector3( center.x - spot.x, 0, center.z - spot.z ).normalize();
	const quaternion = new THREE.Quaternion().setFromAxisAngle( UP, Math.atan2( - toBowl.x, - toBowl.z ) )
		.multiply( new THREE.Quaternion().setFromAxisAngle( new THREE.Vector3( 1, 0, 0 ), Math.PI / 2 ) );

	// set it down so its lowest point touches the table
	mixer.position.copy( spot );
	mixer.quaternion.copy( quaternion );
	mixer.scale.setScalar( 1 );
	mixer.updateMatrixWorld( true );
	const lift = TABLE_TOP - new THREE.Box3().setFromObject( mixer ).min.y;
	return { position: spot.clone().setY( lift ), quaternion };

}

// upright over the bowl, turned so the camera sees it from the side
function uprightPose() {

	const { center } = bowlInfo();
	const toCamera = new THREE.Vector3().subVectors( camera.position, center );
	return new THREE.Quaternion().setFromAxisAngle( UP, Math.atan2( toCamera.x, toCamera.z ) );

}

function mixingHeight( x, z ) {

	return contentsTop( x, z ) - DIP - tipY;

}

// ---------- what happens ----------
function appear( instantly = false ) {

	rest = restPose( findRestSpot() );
	mixer.position.copy( rest.position );
	mixer.quaternion.copy( rest.quaternion );
	mixer.visible = true;
	preloadHandTracker().catch( () => {} ); // so "mix with your hand" starts quickly (no camera yet)
	if ( instantly ) return;

	// pops up with a little bounce
	runSequence( [ {
		duration: 0.6,
		update: ( k ) => {

			mixer.scale.setScalar( Math.max( easeOutBack( k ), 0.001 ) );
			mixer.position.y = rest.position.y + ( 1 - ease( k ) ) * 0.06;

		},
	} ] );

}

function available() {

	const { mixed, mixing, busy, held } = getState();
	return mixer.visible && ! mixed && ! mixing && ! busy && ! held && ! intro.classList.contains( 'show' );

}

async function grab() {

	setState( { mixing: true } );
	controls.enabled = false; // dragging now stirs instead of turning the camera

	const { center } = bowlInfo();
	const from = mixer.position.clone();
	const fromQ = mixer.quaternion.clone();
	const to = new THREE.Vector3( center.x, mixingHeight( center.x, center.z ), center.z );
	const upright = uprightPose();
	mixDough( progress, turned ); // the dough starts (from nothing) the first time

	await runSequence( [ {
		duration: 0.6,
		update: ( k ) => {

			mixer.position.lerpVectors( from, to, ease( k ) );
			mixer.position.y += Math.sin( Math.PI * k ) * 0.08;
			mixer.quaternion.slerpQuaternions( fromQ, upright, ease( k ) );

		},
	} ] );

	target.copy( to );
	holding = true;
	turns.length = 0;
	cameraButton.classList.add( 'show' );
	showTutorial();
	showStatus( `Mixing the dough · ${ Math.round( progress * 100 ) }%` );

}

async function putDown() {

	holding = false;
	running = mouseDown = false;
	cameraButton.classList.remove( 'show' );
	hideGuide();
	stopHandTracking();
	cameraButton.textContent = 'Mix with your hand (C)';
	const from = mixer.position.clone();
	const fromQ = mixer.quaternion.clone();

	await runSequence( [ {
		duration: 0.6,
		update: ( k ) => {

			mixer.position.lerpVectors( from, rest.position, ease( k ) );
			mixer.position.y += Math.sin( Math.PI * k ) * 0.08;
			mixer.quaternion.slerpQuaternions( fromQ, rest.quaternion, ease( k ) );

		},
	} ] );

	controls.enabled = true;
	setState( { mixing: false } );

}

async function finish() {

	mixDough( 1, turned );
	setState( { mixed: true } );
	await putDown();

}

// ---------- stirring with your hand (webcam) ----------
async function toggleCamera() {

	if ( ! holding ) return;

	if ( isTracking() ) {

		stopHandTracking();
		cameraButton.textContent = 'Mix with your hand (C)';
		showTutorial();
		return;

	}

	cameraButton.textContent = 'Starting the camera…';
	try {

		await startHandTracking();
		if ( ! holding ) return stopHandTracking(); // put down while the camera was starting
		cameraButton.textContent = 'Use the mouse instead (C)';

	} catch {

		cameraButton.textContent = 'No camera · use the mouse'; // (refused, or there's no webcam)

	}

	showTutorial();

}

// ---------- "time to mix": camera or mouse? ----------
function showIntro() {

	introNote.textContent = '';
	useCameraButton.disabled = useMouseButton.disabled = false;
	intro.classList.add( 'show' );
	useCameraButton.focus();

}

function hideIntro() {

	intro.classList.remove( 'show' );

}

async function chooseCamera() {

	useCameraButton.disabled = useMouseButton.disabled = true;
	introNote.textContent = 'Waiting for the camera… if your browser asks, click "Allow".';

	try {

		await startHandTracking();
		cameraButton.textContent = 'Use the mouse instead (C)';
		hideIntro();
		grab();

	} catch {

		// declined, or there's no webcam: that's fine, the mouse works too
		introNote.textContent = 'No camera? No problem, you can mix with the mouse!';
		cameraButton.textContent = 'Mix with your hand (C)';
		setTimeout( () => {

			hideIntro();
			grab();

		}, 1600 );

	}

}

function chooseMouse() {

	hideIntro();
	grab();

}

// ---------- the little tutorial ----------
function showTutorial() {

	const withHand = isTracking();
	showGuide( {
		icon: withHand ? '✋' : '🖱️',
		text: withHand ? 'Move your hand in circles in front of the camera' : 'Hold the mouse button and move in circles over the bowl',
		small: withHand ? 'Just showing your hand won\'t mix it, keep going round!' : 'Keep going round: holding still won\'t mix it',
		motion: 'circle',
	} );
	tutorialFrom = progress;
	stillFor = 0;

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

// ---------- hooks for interaction.js ----------
// the hover hint for the mixer: { text, clickable }, false to show nothing, null if it's not about the mixer
export function mixerHint( ray ) {

	if ( ! mixer ) return null;
	if ( intro.classList.contains( 'show' ) ) return false; // the "time to mix" card is up
	if ( holding && guideShown() ) return false; // the tutorial already says it
	if ( holding && isTracking() ) return { text: handPosition() ? 'keep moving your hand in circles' : 'show your hand to the camera · Esc to put the mixer down', clickable: false };
	if ( holding ) return { text: running ? 'keep moving in circles' : 'hold the mouse button and move in circles · C to use your hand · Esc to put it down', clickable: false };
	if ( getState().mixing ) return false; // on its way to or from the bowl
	if ( ! mixer.visible || ray.intersectObject( mixer, true ).length === 0 ) return null;
	if ( getState().mixed ) return { text: 'Hand Mixer · the dough is mixed', clickable: false };
	return { text: 'Hand Mixer · pick up and mix the dough', clickable: available() };

}

// a click: if it's on the mixer, pick the mixer up
export function tryGrabMixer( ray ) {

	if ( ! mixer || ! available() || ray.intersectObject( mixer, true ).length === 0 ) return false;
	grab();
	return true;

}

// ---------- setup and every frame ----------
export function initMixer( { scene, room: kitchen, camera: cam, controls: orbit, canvas } ) {

	room = kitchen;
	camera = cam;
	controls = orbit;
	mixer = buildMixer();
	mixer.visible = false;
	scene.add( mixer );

	window.addEventListener( 'pointermove', ( e ) => {

		pointer.set( ( e.clientX / window.innerWidth ) * 2 - 1, - ( e.clientY / window.innerHeight ) * 2 + 1 );

	} );
	canvas.addEventListener( 'pointerdown', ( e ) => { if ( holding && e.button === 0 ) mouseDown = true; } );
	window.addEventListener( 'pointerup', () => { mouseDown = false; } );
	window.addEventListener( 'blur', () => { mouseDown = false; } );
	window.addEventListener( 'keydown', ( e ) => {

		if ( e.key === 'Escape' && holding ) putDown();
		if ( ( e.key === 'c' || e.key === 'C' ) && holding ) toggleCamera();

	} );
	cameraButton.addEventListener( 'click', toggleCamera );
	useCameraButton.addEventListener( 'click', chooseCamera );
	useMouseButton.addEventListener( 'click', chooseMouse );

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
		setTimeout( showIntro, 700 ); // after the mixer has popped up

	};

	if ( allIn( getState() ) ) ready();
	else {

		const stop = subscribe( ( state ) => {

			if ( ! allIn( state ) || mixer.visible ) return;
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
	for ( const { beater, direction } of beaters ) beater.rotation.y += direction * spin * dt;
	shaker.position.set( ( Math.random() - 0.5 ) * 0.0025, ( Math.random() - 0.5 ) * 0.0015, ( Math.random() - 0.5 ) * 0.0025 ).multiplyScalar( spin / 45 );

	if ( ! holding ) return;

	// it follows your hand (camera) or the mouse around the inside of the bowl, kept away from the wall
	const { center, rimY, radius } = bowlInfo();
	updateHandTracking();
	const hand = isTracking() ? handPosition() : null;

	if ( hand ) target.copy( handTarget( hand, center, radius * 0.45 ) );
	else if ( ! isTracking() ) {

		raycaster.setFromCamera( pointer, camera );
		plane.set( UP, - rimY );
		if ( raycaster.ray.intersectPlane( plane, target ) ) {

			const offset = new THREE.Vector3( target.x - center.x, 0, target.z - center.z );
			offset.clampLength( 0, radius * 0.45 );
			target.set( center.x + offset.x, 0, center.z + offset.z );

		}

	}

	// on while the mouse button is held or a hand is in front of the camera
	running = mouseDown || hand !== null;

	const x = mixer.position.x;
	const z = mixer.position.z;
	const before = Math.atan2( z - center.z, x - center.x );
	const follow = 1 - Math.exp( - dt * 10 );
	mixer.position.x += ( target.x - x ) * follow;
	mixer.position.z += ( target.z - z ) * follow;
	mixer.position.y = mixingHeight( mixer.position.x, mixer.position.z );

	// it only mixes while it's on AND going round in circles (hand or mouse):
	// - the net turning around the middle of the bowl over the last 2 seconds has to be fast enough
	//   (going round adds up; back and forth, or just holding a hand up, cancels out to ~0)
	// - near the very middle angles jump around, so that doesn't count
	// - and it has to be moving right now, so it stops the moment you stop
	clock += dt;
	const distance = Math.hypot( mixer.position.x - center.x, mixer.position.z - center.z );
	const after = Math.atan2( mixer.position.z - center.z, mixer.position.x - center.x );
	const turn = distance > radius * 0.15 ? Math.atan2( Math.sin( after - before ), Math.cos( after - before ) ) : 0;
	turns.push( { t: clock, turn } );
	while ( turns.length && turns[ 0 ].t < clock - SWIRL_WINDOW ) turns.shift();
	const swirlRate = Math.abs( turns.reduce( ( sum, f ) => sum + f.turn, 0 ) ) / SWIRL_WINDOW;
	// (the mouse or the hand itself, not the mixer, which glides on for a moment after you stop)
	const moving = dt > 0 && Math.hypot( target.x - lastTarget.x, target.z - lastTarget.z ) / dt > 0.02;
	lastTarget.copy( target );

	const gained = running && moving ? Math.max( 0, swirlRate - MIN_SWIRL ) * distance * dt / MIX_DISTANCE : 0;
	progress = Math.min( 1, progress + gained );

	// the tutorial fades out once you've got the hang of it, and comes back if you stop
	stillFor = gained > 0 ? 0 : stillFor + dt;
	if ( progress - tutorialFrom > 0.12 ) hideGuide();
	if ( stillFor > 3 && ! guideShown() ) showTutorial();

	mixDough( progress, turned * 0.02 );
	showStatus( `Mixing the dough · ${ Math.round( progress * 100 ) }%` );
	if ( progress >= 1 ) finish();

}
