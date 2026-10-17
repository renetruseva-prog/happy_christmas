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
//   alarm.js  the smoke alarm
//   flames.js and smoke.js  the fire in the oven and the smoke when they burn (Shadertoy shaders,
//   ported in shaders/)
import * as THREE from 'three/webgpu';
import { bakeBand, bakeResult } from '../config.js';
import { getState, setState, subscribe } from '../state.js';
import { showGuide, hideGuide, showOvenTimer, showBakeResult, showPerfectBake, clock } from '../ui.js';
import { animate, ease } from '../sequence.js';
import { loadBaking, loadDecor } from '../progress.js';
import { cuts, bakeLevel } from '../cutting/cuts.js';
import { initOven, ovenParts, openDoor, setHeat, showOnDisplay } from './oven.js';
import { findTray, slotPosition, placeTray, moveTray } from './tray.js';
import { initSmoke, updateSmoke, smokeLevel, overSmoke, puffSmoke } from './smoke.js';
import { initFlames, updateFlames, flareLevel } from './flames.js';
import { initKnob, hitsKnob, turnKnob, setTemperature, shownTemperature, heatLevel, NORMAL } from './knob.js';
import { setAlarm, silenceAlarm } from './alarm.js';
import { VIEWS } from '../views.js';
import { enableWalking, updateWalking, walkPose, reachPoint, isBlocked } from '../walking.js';
import { addSolids } from '../solids.js';
import { moveCameraTo } from '../views.js';
import { Hand } from './hand.js';
import { rolledDough } from '../rolling/index.js';

const UP = new THREE.Vector3( 0, 1, 0 );
const REACH = 0.45; // how close a cookie has to be to where the hand reaches (see walking.js) to pick it up
const TRAY_REACH = 0.5; // and the tray, to put one on it
const HOLD_SCALE = 1.4; // a carried cookie is a bit bigger, so it can be seen
const GRIP = 0.85; // how tightly the hand closes round it
const TRAY_HEIGHT = 0.96; // a dragged tray's middle floats this high, just over the counter
const TRAY_X = [ 0.6, 2.1 ];
const TRAY_Z = [ - 1.68, - 0.75 ];

const OVEN_VIEW = VIEWS.oven; // the view of the tray and the oven, once the cookies are all on the tray
const ROUNDING = 0.0015; // a cookie's middle is this far over what it lies on (see cutting/cuts.js)

// where the tray goes on its way into the oven: in front of the open door, then on the rack
const OVEN_FRONT = new THREE.Vector3( 1.88, 0.47, - 1.0 );
const OVEN_INSIDE = new THREE.Vector3( 1.88, 0.421, - 1.72 );

let camera = null;
let controls = null;
let tray = null; // see tray.js
let hand3d = null; // the player's hand (see hand.js)

let dragging = null; // what's being dragged: { tray: true } or { knob: true, x, y }
let overTarget = false; // the tray is over the oven right now
let carrying = null; // the cookie in the hand: { cookie, index }
let handShown = false; // the mouse is a hand right now
let takingOut = false; // the cookies are coming out of the oven (not carried any more, not baked yet)
let guideKey = ''; // which walking instructions are showing
let notice = null; // a short message for the hover hint, and for how long
let noticeFor = 0;
const trayAt = new THREE.Vector3(); // where a dragged tray is going
let shown = ''; // what the oven's display shows now
let knobShownFor = 0; // the display shows the temperature for a moment after the knob's turned
const SMOKE_ALARM = 0.3; // the alarm goes off when the smoke's this thick

const pointer = new THREE.Vector2( 2, 2 );
const raycaster = new THREE.Raycaster();
const trayPlane = new THREE.Plane( UP, - TRAY_HEIGHT );
const carryAt = new THREE.Vector3();

// ---------- helpers ----------
// how long they've been in, in whole real seconds: the number on the oven's clock, and the one in
// the result. From the wall clock (bakeStart is saved, so a refresh doesn't change it), not from
// the frames, which are capped and slow
function realSeconds() {

	const { bakeStart } = getState();
	return bakeStart === null ? 0 : Math.max( 0, Math.floor( ( Date.now() - bakeStart ) / 1000 ) );

}

// how far along they are, where 1 is the start of perfect at the heat the dial shows
function bakeProgress() {

	return realSeconds() / bakeBand( shownTemperature() ).from;

}

// the cookies still on the dough
function looseCookies() {

	const { onTray } = getState();
	return cuts.filter( ( c, i ) => ! onTray.includes( i ) ).map( ( c ) => c.cookie );

}

// the mouse is a hand: from when the cookies are cut until the tray goes in the oven
function handMode() {

	const { cut, baking, baked } = getState();
	return cut && ! baking && ! baked && ! takingOut;

}

function say( text ) {

	notice = text;
	noticeFor = 2.5;

}

// how far apart two things are along the floor
function flat( a, b ) {

	return Math.hypot( a.x - b.x, a.z - b.z );

}

const at = new THREE.Vector3();
const reach = new THREE.Vector3();

function nearCookie( cookie ) {

	return flat( reachPoint( reach ), cookie.getWorldPosition( at ) ) < REACH;

}

function nearTray() {

	return flat( reachPoint( reach ), tray.centre ) < TRAY_REACH;

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

// a cookie lying flat (as cut: see cutting/cuts.js), and how far it's tilted up towards the
// player while it's held, so the face of it shows
const FLAT = new THREE.Quaternion().setFromEuler( new THREE.Euler( - Math.PI / 2, 0, 0 ) );
const HOLD_TILT = 0.95;
const tilted = new THREE.Quaternion();
const towards = new THREE.Vector3();

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
		knobShownFor = 1.5;

	}

}

// let go
function drop() {

	const dropped = dragging;
	dragging = null;
	controls.enabled = true;
	if ( dropped.knob ) setState( { temperature: shownTemperature() } ); // (saved)
	else dropTray();

}

// ---------- carrying the cookies, one by one ----------
function pickUp( cookie ) {

	carrying = { cookie, index: cuts.findIndex( ( c ) => c.cookie === cookie ) };
	guideKey = '';

}

// put it back on the dough where it was cut
function putBackCarried() {

	const { cookie } = carrying;
	carrying = null;
	guideKey = '';
	flyCookie( cookie, cookie.userData.cutAt, 0.6 );

}

// onto the tray, in the next free place
async function placeCarried() {

	const { cookie, index } = carrying;
	carrying = null;
	guideKey = '';

	const onTray = [ ...getState().onTray, index ];
	setState( { onTray } );
	const to = slotPosition( tray, onTray.length - 1 ).add( new THREE.Vector3( 0, ROUNDING, 0 ) );
	await flyCookie( cookie, to, 0.6 );
	tray.mesh.attach( cookie ); // it goes where the tray goes now

	// the last one: over to the oven
	if ( trayReady() ) {

		setState( { busy: true } );
		await lookAtOven();
		setState( { busy: false } );
		guideTray();

	}

}

// the cookie in the hand is held under it
function followHand( dt ) {

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

const flatLook = new THREE.Vector3();
const floorAt = new THREE.Vector3();

// where the hand is: on whatever the mouse points at, or on the table or counter below it. null
// when the mouse is off the page (or a card is open), so the hand isn't drawn
function handPoint() {

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

// ---------- the tutorial ----------
// what to do next, depending on whether a cookie is in the hand and how close the player is
function guideCarrying() {

	const near = carrying ? nearTray() : looseCookies().some( nearCookie );
	const key = `${ carrying ? 'carry' : 'empty' }-${ near }`;
	if ( key === guideKey ) return;
	guideKey = key;

	const guides = {
		'empty-false': [ 'Walk to the dough to pick up the cookies', 'Use the arrow keys or W A S D to walk ahead, back, left and right' ],
		'empty-true': [ 'Click a cookie to pick it up', 'Then walk with the arrow keys to the baking tray next to the oven' ],
		'carry-false': [ 'Carry the cookie to the baking tray', 'Walk with the arrow keys or W A S D, towards the oven. Esc puts the cookie back' ],
		'carry-true': [ 'Click the baking tray to put the cookie down', 'Then walk back to the dough for the next one' ],
	};
	const [ text, small ] = guides[ key ];
	showGuide( { text, small, motion: 'drag' } );

}

function guideTray() {

	guideKey = 'tray';
	showGuide( { text: 'Now put the tray in the oven', small: 'Hold the mouse on the baking tray and drag it into the oven', motion: 'drag' } );

}

function guideBaking() {

	showGuide( { text: 'Keep an eye on the clock!', small: `${ bakeBand( NORMAL ).from }-${ bakeBand( NORMAL ).to } seconds at ${ NORMAL }° makes them perfect (${ bakeBand( 250 ).from }-${ bakeBand( 250 ).to } above 200°). Click the oven to take them out`, motion: 'circle' } );
	setTimeout( () => { if ( getState().baking ) hideGuide(); }, 9000 );

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
	if ( carrying ) {

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

		if ( carrying ) {

			if ( ! hitsTray( ray ) ) return true;
			if ( nearTray() ) placeCarried();
			else say( 'too far from the baking tray: walk closer with the arrow keys' );
			return true;

		}

		const hit = ray.intersectObjects( looseCookies(), false )[ 0 ];
		if ( hit ) {

			if ( nearCookie( hit.object ) ) pickUp( hit.object );
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
	addSolids( room );
	initOven( room );
	initKnob( room );
	initFlames( room );
	initSmoke( room );

	window.addEventListener( 'pointerdown', onPointerDown, { capture: true } );
	window.addEventListener( 'pointermove', setPointer );
	window.addEventListener( 'pointerup', () => { if ( dragging ) drop(); } );
	window.addEventListener( 'blur', () => { if ( dragging ) { overTarget = false; drop(); } } );
	window.addEventListener( 'keydown', ( e ) => { if ( e.key === 'Escape' && carrying ) putBackCarried(); } );

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
		if ( ! hand ) guideKey = '';

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
	hand3d.update( dt, { point, look: flatLook.normalize(), grip: carrying || dragging?.tray ? GRIP : 0.12 } );
	document.body.classList.toggle( 'hand-mode', hand3d.show );

	if ( hand ) {

		const free = ! getState().busy && ! dragging;
		if ( free ) updateWalking( dt );
		if ( carrying ) followHand( dt );
		if ( free && ! trayReady() ) guideCarrying();

	}

	// in the oven: the clock is the real time since they went in (see realSeconds)
	const { baking } = getState();
	const s = baking ? realSeconds() : 0;
	const band = bakeBand( shownTemperature() );
	if ( baking ) bakeLevel.value = bakeProgress();

	// the oven's display: the temperature for a moment after the knob's turned (and whenever
	// it's not baking), otherwise the clock
	knobShownFor -= dt;
	const showKnob = dragging?.knob || knobShownFor > 0 || ! baking;
	const text = showKnob ? `${ shownTemperature() }°` : clock( s );
	const warn = ! showKnob && s > band.to;
	if ( text + warn !== shown ) {

		shown = text + warn;
		showOnDisplay( text, { warn } );

	}

	// the fire: higher the hotter the oven's set, flaring when the door opens; it follows the
	// mouse while that's over the oven
	raycaster.setFromCamera( pointer, camera );
	const overOven = ! dragging && hitsOven( raycaster );
	updateFlames( dt, { target: baking ? 1 : 0, hot: heatLevel(), ray: raycaster.ray, overOven } );
	setHeat( ( baking ? 0.4 + 0.9 * heatLevel() : 0 ) + flareLevel(), performance.now() / 1000 );

	// smoke (a Shadertoy shader too, see shaders/smoke.js): from the last perfect second, as they
	// start to burn, thicker and darker until they're black; it clears once they're out, or for a while
	// when it's waved away. Thick smoke sets off the alarm and hides the clock
	const smoking = baking ? THREE.MathUtils.clamp( ( s - ( band.to - 1 ) ) / 15, 0, 1 ) : 0;
	updateSmoke( dt, { target: smoking, darkness: THREE.MathUtils.clamp( ( s - band.to ) / 10, 0, 1 ), ray: raycaster.ray, camera } );
	const smoke = smokeLevel();
	setAlarm( baking && smoke > SMOKE_ALARM ); // (only while it's baking: once the cookies are out it's quiet at once)
	if ( baking ) showOvenTimer( s, { temperature: shownTemperature(), smoke, alarm: smoke > SMOKE_ALARM } );

}
