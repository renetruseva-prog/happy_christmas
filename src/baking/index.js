// the baking step: once the cookies are cut, the mouse becomes a hand. Click a cookie to pick it
// up, walk to the baking tray next to the oven with the arrow keys (see walking.js) and click the
// tray to put it down, then walk back for the next one. You can only reach a cookie or the tray
// when you're close to it. When they're all on the tray, the view moves over to the tray and the
// oven, and the player drags the tray into the oven (its door opens when the tray is picked up),
// and the hand goes away when the baking starts. Then it's up
// to them to take the cookies out in time (click the oven): by real seconds in the oven and the
// heat they come out at (see BAKE_BANDS in config.js) they're underbaked, perfect or burnt
// (smoke starts coming out as they start to burn). How
// they turned out shows on the cookies and on a card, which also offers to bake a new batch.
// The oven's knob sets the heat: hotter has a shorter perfect window (and the fire burns higher). When they burn, smoke pours out and the smoke alarm goes off, and
// the clock is hard to read through the smoke: wave the mouse over it to clear it.
//   oven.js  the door, the glow and the clock    tray.js  the baking tray    knob.js  the knob
//   alarm.js  the smoke alarm    hand.js  the 3D hand
//   carrying.js  carrying the cookies to the tray    guides.js  the tutorial cards
//   ovenDisplay.js  the clock, the display, the fire and the smoke while baking
//   flames.js and smoke.js  the fire in the oven and the smoke when they burn (Shadertoy shaders,
//   ported in shaders/)
import * as THREE from 'three/webgpu';
import { bakeBand, bakeResult } from '../core/config.js';
import { getState, setState, subscribe } from '../core/state.js';
import { hideGuide, showOvenTimer, showBakeResult, showPerfectBake } from '../ui.js';
import { animate, ease } from '../core/sequence.js';
import { loadBaking, loadDecor } from '../core/progress.js';
import { cuts, bakeLevel } from '../cutting/cuts.js';
import { initOven, ovenParts, openDoor } from './oven.js';
import { findTray, slotPosition, placeTray, moveTray } from './tray.js';
import { initSmoke, smokeLevel, overSmoke, puffSmoke } from './smoke.js';
import { initFlames } from './flames.js';
import { initKnob, hitsKnob, turnKnob, setTemperature, shownTemperature, NORMAL } from './knob.js';
import { silenceAlarm } from './alarm.js';
import { VIEWS } from '../core/views.js';
import { enableWalking, updateWalking, walkPose, isBlocked } from '../input/walking.js';
import { addSolids } from '../world/solids.js';
import { moveCameraTo } from '../core/views.js';
import { Hand } from './hand.js';
import { initCarrying, carried, looseCookies, nearCookie, nearTray, pickUp, putBackCarried, placeCarried, followHand, handPoint, ROUNDING } from './carrying.js';
import { initGuides, resetGuide, guideCarrying, guideTray, guideBaking, updateBakingGuide, zoomedOnOven } from './guides.js';
import { initOvenDisplay, updateOven, realSeconds, bakeProgress, knobTurned } from './ovenDisplay.js';
import { rolledDough } from '../rolling/index.js';

const UP = new THREE.Vector3( 0, 1, 0 );
const GRIP = 0.85; // how tightly the hand closes round it
const TRAY_HEIGHT = 0.96; // a dragged tray's middle floats this high, just over the counter
const TRAY_X = [ 0.6, 2.1 ];
const TRAY_Z = [ - 1.68, - 0.75 ];

const OVEN_VIEW = VIEWS.oven; // the view of the tray and the oven, once the cookies are all on the tray

// where the tray goes on its way into the oven: in front of the open door, then on the rack
const OVEN_FRONT = new THREE.Vector3( 1.88, 0.47, - 1.0 );
const OVEN_INSIDE = new THREE.Vector3( 1.88, 0.421, - 1.72 );

let camera = null;
let controls = null;
let tray = null; // see tray.js
let hand3d = null; // the player's hand (see hand.js)

let dragging = null; // what's being dragged: { tray: true } or { knob: true, x, y }
let overTarget = false; // the tray is over the oven right now
let handShown = false; // the mouse is a hand right now
let takingOut = false; // the cookies are coming out of the oven (not carried any more, not baked yet)
let notice = null; // a short message for the hover hint, and for how long
let noticeFor = 0;
const trayAt = new THREE.Vector3(); // where a dragged tray is going

const flatLook = new THREE.Vector3();
const pointer = new THREE.Vector2( 2, 2 );
const raycaster = new THREE.Raycaster();
const trayPlane = new THREE.Plane( UP, - TRAY_HEIGHT );
const carryAt = new THREE.Vector3();

// ---------- helpers ----------
// the mouse is a hand: from when the cookies are cut until the tray goes in the oven
function handMode() {

	const { cut, baking, baked } = getState();
	return cut && ! baking && ! baked && ! takingOut;

}

function say( text ) {

	notice = text;
	noticeFor = 2.5;

}

// all the cookies are on the tray (and it isn't in the oven or baked yet)
function trayReady() {

	const { cut, onTray, baking, baked } = getState();
	return cut && cuts.length > 0 && onTray.length === cuts.length && ! baking && ! baked;

}

function hitsOven( ray ) {

	return ray.intersectObjects( ovenParts, true ).length > 0;

}

function hitsTray( ray ) {

	return ray.intersectObject( tray.mesh, true ).length > 0;

}

// move the view over to the tray and the oven
function lookAtOven( duration = 1.4 ) {

	controls.enabled = false;
	const fromP = camera.position.clone();
	const fromT = controls.target.clone();
	return animate( duration, ( k ) => {

		camera.position.lerpVectors( fromP, OVEN_VIEW.position, ease( k ) );
		controls.target.lerpVectors( fromT, OVEN_VIEW.target, ease( k ) );

	} ).then( () => { controls.enabled = true; } );

}

// ---------- dragging: the cookies onto the tray, then the tray into the oven ----------
// a press on a cookie (or on the full tray) picks it up. This runs before the view's own
// listener (capture), so the view doesn't turn while dragging
function onPointerDown( e ) {

	if ( e.button !== 0 || e.target !== controls.domElement || dragging ) return;
	setPointer( e );

	// the oven's knob can be turned any time
	if ( hitsKnob( raycaster ) ) {

		dragging = { knob: true, x: e.clientX, y: e.clientY };
		controls.enabled = false;
		return;

	}

	// the full tray can be picked up and dragged to the oven
	if ( ! trayReady() || getState().busy || ! hitsTray( raycaster ) ) return;
	dragging = { tray: true };
	trayAt.copy( tray.centre );
	openDoor( true ); // ready for it
	controls.enabled = false;
	hideGuide();

}

function setPointer( e ) {

	pointer.set( ( e.clientX / window.innerWidth ) * 2 - 1, - ( e.clientY / window.innerHeight ) * 2 + 1 );
	raycaster.setFromCamera( pointer, camera );

	// turning the knob: right or up is hotter
	if ( dragging?.knob ) {

		turnKnob( e.clientX - dragging.x, e.clientY - dragging.y );
		dragging.x = e.clientX;
		dragging.y = e.clientY;
		knobTurned();

	}

}

// let go
function drop() {

	const dropped = dragging;
	dragging = null;
	controls.enabled = true;
	if ( dropped.knob ) {

		setState( { temperature: shownTemperature() } ); // (saved)
		if ( getState().baking && ! zoomedOnOven() ) guideBaking(); // (the times are different at this heat)

	} else dropTray();

}

// ---------- carrying the cookies, one by one (see carrying.js) ----------
function pickUpCookie( cookie ) {

	pickUp( cookie );
	resetGuide();

}

// put it back on the dough where it was cut
function putBackCookie() {

	putBackCarried();
	resetGuide();

}

// onto the tray, in the next free place
async function placeCookie() {

	await placeCarried();
	resetGuide();

	// the last one: over to the oven
	if ( trayReady() ) {

		setState( { busy: true } );
		await lookAtOven();
		setState( { busy: false } );
		guideTray();

	}

}

// the tray: into the oven if it's over it, otherwise back on the counter
async function dropTray() {

	if ( overTarget ) return putInOven();

	setState( { busy: true } );
	await moveTray( tray, tray.centre, { duration: 0.5 } );
	await openDoor( false );
	setState( { busy: false } );

}

// ---------- the oven ----------
// the tray goes in from wherever it is (the door's already open)
async function putInOven() {

	setState( { busy: true } );
	hideGuide();
	await openDoor( true );
	await moveTray( tray, OVEN_FRONT, { duration: 0.5 } );
	await moveTray( tray, OVEN_INSIDE, { duration: 0.6 } );
	await openDoor( false );
	setState( { busy: false, baking: true, bakeStart: Date.now(), baked: null } );
	controls.enabled = true;
	guideBaking();

}

async function takeOut() {

	const seconds = realSeconds();
	const temperature = shownTemperature();
	const result = { result: bakeResult( seconds, temperature ), seconds, temperature };
	bakeLevel.value = bakeProgress();
	if ( result.result === 'perfect' ) showPerfectBake( result ); // (at once: they know it went right)
	takingOut = true;
	setState( { baking: false, busy: true } );
	silenceAlarm();
	showOvenTimer( null );
	hideGuide();

	// (opening the door lets out a puff of smoke if it's smoky in there)
	const door = openDoor( true );
	if ( smokeLevel() > 0.1 ) puffSmoke( 0.4 );
	await door;
	await moveTray( tray, OVEN_FRONT, { duration: 0.6 } );
	await moveTray( tray, tray.centre, { duration: 0.9, lift: 0.15 } );
	await openDoor( false );
	takingOut = false;
	setState( { busy: false, baked: result } );
	// perfect: no card, straight on to decorating (it explains itself at the bottom); anything else
	// has to be baked again
	if ( result.result === 'perfect' ) decorate();
	else showBakeResult( result, { again: bakeAgain, decorate } );

}

// perfectly baked: the tray goes back to the table to decorate them (see decorating/)
function decorate() {

	setState( { decorating: true } );

}

// another go: the same cookies, raw again, ready to go back into the oven
function bakeAgain() {

	bakeLevel.value = 0;
	setState( { baked: null, bakeStart: null } );
	guideTray();

}

// ---------- hooks for interaction.js ----------
// the hover hint: { text, clickable }, false to show nothing, null if it's not about this step
export function bakingHint( ray ) {

	if ( ! tray ) return null;
	const { cut, baking, baked, busy, onTray, mixing, rolling } = getState();
	if ( mixing || rolling ) return null;

	if ( dragging?.knob ) return { text: `${ shownTemperature() }° · hotter bakes faster, cooler slower`, clickable: false };
	if ( dragging?.tray ) return { text: overTarget ? 'let go to put the tray in the oven' : 'drag the tray into the oven', clickable: false };
	if ( hitsKnob( ray ) ) return { text: `Oven Knob · drag to set the heat (${ shownTemperature() }°) · hotter bakes faster`, clickable: true };
	if ( overSmoke() ) return { text: 'Smoke · wave the mouse over it to clear it', clickable: false };

	if ( notice ) return { text: notice, clickable: false };
	if ( isBlocked() ) return { text: 'Something is in the way: step to the side to get past it', clickable: false };

	const loose = looseCookies();
	const hit = ray.intersectObjects( [ ...ovenParts, tray.mesh, ...loose ], true )[ 0 ];
	if ( ! hit ) return null;
	const onCookie = cuts.some( ( c ) => c.cookie === hit.object ); // (the ones on the tray are part of it)

	if ( baking ) return onCookie ? null : { text: 'Oven · click to take the cookies out', clickable: ! busy };
	if ( baked ) {

		const names = { under: 'underbaked', perfect: 'perfectly baked', burnt: 'burnt' };
		return { text: onCookie ? `Cookie · ${ names[ baked.result ] }` : 'Baking Tray · the cookies are baked', clickable: false };

	}

	const onTrayNow = onCookie || hit.object === tray.mesh || hit.object.parent === tray.mesh;
	if ( carried() ) {

		if ( ! onTrayNow ) return { text: 'Walk to the baking tray next to the oven · Esc puts the cookie back', clickable: false };
		return nearTray()
			? { text: `Baking Tray · click to put the cookie down (${ onTray.length }/${ cuts.length })`, clickable: true }
			: { text: 'Baking Tray · too far: walk closer with the arrow keys', clickable: false };

	}

	if ( ! cut ) return { text: onTrayNow ? 'Baking Tray · for the cookies, once they\'re cut' : 'Oven · for baking the cookies, once they\'re cut', clickable: false };
	if ( loose.includes( hit.object ) ) {

		const name = hit.object.userData.shape === 'star' ? 'Star Cookie' : 'Cookie';
		return nearCookie( hit.object ) ? { text: `${ name } · click to pick it up`, clickable: ! busy } : { text: `${ name } · too far: walk closer with the arrow keys`, clickable: false };

	}

	if ( trayReady() ) return onTrayNow ? { text: 'Baking Tray · drag it into the oven', clickable: ! busy } : { text: 'Oven · drag the baking tray in here', clickable: false };
	if ( onTrayNow ) return { text: `Baking Tray · carry the cookies here (${ onTray.length }/${ cuts.length })`, clickable: false };
	return { text: 'Oven · put the cookies on the baking tray first', clickable: false };

}

// a click: pick a cookie up, put it on the tray, or take the cookies out of the oven
export function tryBakingClick( ray ) {

	if ( ! tray ) return false;
	if ( dragging ) return true; // (letting go drops it)

	const { baking, busy } = getState();

	if ( handMode() && ! trayReady() && ! busy ) {

		if ( carried() ) {

			if ( ! hitsTray( ray ) ) return true;
			if ( nearTray() ) placeCookie();
			else say( 'too far from the baking tray: walk closer with the arrow keys' );
			return true;

		}

		const hit = ray.intersectObjects( looseCookies(), false )[ 0 ];
		if ( hit ) {

			if ( nearCookie( hit.object ) ) pickUpCookie( hit.object );
			else say( 'too far from the dough: walk closer with the arrow keys' );
			return true;

		}

	}

	if ( baking && ! busy && hitsOven( ray ) ) {

		takeOut();
		return true;

	}

	return false;

}

// ---------- setup and every frame ----------
export function initBaking( { room, camera: cam, controls: ctrl } ) {

	camera = cam;
	controls = ctrl;
	tray = findTray( room );
	if ( ! tray ) return;
	hand3d = new Hand();
	room.add( hand3d.root );
	initCarrying( { camera, tray, hand: hand3d, pointer, raycaster } );
	initGuides( camera );
	initOvenDisplay( camera );
	addSolids( room );
	initOven( room );
	initKnob( room );
	initFlames( room );
	initSmoke( room );

	window.addEventListener( 'pointerdown', onPointerDown, { capture: true } );
	window.addEventListener( 'pointermove', setPointer );
	window.addEventListener( 'pointerup', () => { if ( dragging ) drop(); } );
	window.addEventListener( 'blur', () => { if ( dragging ) { overTarget = false; drop(); } } );
	window.addEventListener( 'keydown', ( e ) => { if ( e.key === 'Escape' && carried() ) putBackCookie(); } );

	// how far it got before a page refresh
	const { cut } = getState();
	const saved = loadBaking();
	setTemperature( saved.temperature ?? NORMAL );
	setState( { temperature: shownTemperature() } );
	if ( cut ) {

		const onTray = saved.onTray.filter( ( i, n, all ) => i < cuts.length && all.indexOf( i ) === n );
		onTray.forEach( ( i, n ) => {

			const { cookie } = cuts[ i ];
			cookie.position.copy( slotPosition( tray, n ) ).y += ROUNDING;
			tray.mesh.attach( cookie );

		} );

		const full = onTray.length === cuts.length;
		if ( full && saved.baked ) {

			bakeLevel.value = saved.baked.seconds / bakeBand( saved.baked.temperature ?? NORMAL ).from;
			setState( { onTray, baked: saved.baked } );
			if ( ! loadDecor().decorating ) setTimeout( () => { if ( saved.baked.result === 'perfect' ) decorate(); else showBakeResult( saved.baked, { again: bakeAgain, decorate } ); }, 600 ); // (where they were left)

		} else if ( full && saved.bakeStart !== null ) {

			// still in the oven: it kept baking while the page was away
			placeTray( tray, OVEN_INSIDE );
			setState( { onTray, baking: true, bakeStart: saved.bakeStart } );

		} else {

			setState( { onTray } );
			if ( full ) {

				// ready to go in: straight to the view of the oven
				camera.position.copy( OVEN_VIEW.position );
				controls.target.copy( OVEN_VIEW.target );
				guideTray();

			}

		}

	}

}

// the baking tray (see tray.js), for the decorating, which brings it back to the table
export function bakingTray() {

	return tray;

}

export function updateBaking( dt ) {

	if ( ! tray ) return;

	updateBakingGuide();

	// a dragged tray follows the mouse just over the counter
	if ( dragging?.tray ) {

		raycaster.setFromCamera( pointer, camera );
		overTarget = hitsOven( raycaster );
		if ( raycaster.ray.intersectPlane( trayPlane, carryAt ) ) {

			carryAt.x = THREE.MathUtils.clamp( carryAt.x, ...TRAY_X );
			carryAt.z = THREE.MathUtils.clamp( carryAt.z, ...TRAY_Z );
			trayAt.lerp( carryAt, 1 - Math.exp( - dt * 12 ) );
			placeTray( tray, trayAt );

		}

	}

	// carrying the cookies to the tray: the mouse is a hand, the arrow keys walk, and what to do
	// next is explained. All of it goes away once the tray is in the oven
	const hand = handMode();
	if ( hand !== handShown ) {

		handShown = hand;
		enableWalking( hand );
		if ( ! hand ) resetGuide();

		// the view comes down to eye level for walking about (unless the tray's already full and
		// the view is on the oven)
		else if ( ! trayReady() ) moveCameraTo( walkPose( rolledDough()?.position ), { duration: 1.0 } );

	}

	noticeFor -= dt;
	if ( noticeFor <= 0 ) notice = null;

	// the 3D hand (it's the mouse: the normal pointer is hidden while it shows)
	const point = handMode() ? handPoint() : null;
	camera.getWorldDirection( flatLook ).setY( 0 );
	if ( flatLook.lengthSq() < 1e-6 ) flatLook.set( 0, 0, - 1 );
	hand3d.update( dt, { point, look: flatLook.normalize(), grip: carried() || dragging?.tray ? GRIP : 0.12 } );
	document.body.classList.toggle( 'hand-mode', hand3d.show );

	if ( hand ) {

		const free = ! getState().busy && ! dragging;
		if ( free ) updateWalking( dt );
		if ( carried() ) followHand( dt );
		if ( free && ! trayReady() ) guideCarrying();

	}

	// the clock, the display, the fire and the smoke (see ovenDisplay.js)
	raycaster.setFromCamera( pointer, camera );
	updateOven( dt, { knobHeld: !! dragging?.knob, ray: raycaster.ray, overOven: ! dragging && hitsOven( raycaster ) } );

}
