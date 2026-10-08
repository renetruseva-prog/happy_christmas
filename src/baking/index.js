// the baking step: once the cookies are cut, drag each one off the dough onto the baking tray
// next to the oven. When they're all on it, the view moves over to the tray and the oven, and the
// player drags the tray into the oven (its door opens when the tray is picked up). Then it's up
// to them to take the cookies out in time (click the oven): around 20 seconds they're
// underbaked, 40 is perfect, and by 60 they're burnt (smoke starts coming out before that). How
// they turned out shows on the cookies and on a card, which also offers to bake a new batch.
// The oven's knob sets the heat: hotter bakes faster (and the fire burns higher), cooler slower;
// the times above are at 180°. When they burn, smoke pours out and the smoke alarm goes off, and
// the clock is hard to read through the smoke: wave the mouse over it to clear it.
//   oven.js  the door, the glow and the clock    tray.js  the baking tray    knob.js  the knob
//   alarm.js  the smoke alarm
//   flames.js and smoke.js  the fire in the oven and the smoke when they burn (Shadertoy shaders,
//   ported in shaders/)
import * as THREE from 'three/webgpu';
import { BAKE_PERFECT, UNDERBAKED_UNTIL, BURNT_FROM } from '../config.js';
import { getState, setState, subscribe } from '../state.js';
import { showGuide, hideGuide, showOvenTimer, showBakeResult, clock } from '../ui.js';
import { animate, ease } from '../sequence.js';
import { loadBaking } from '../progress.js';
import { cuts, bakeLevel } from '../cutting/cuts.js';
import { initOven, ovenParts, openDoor, setHeat, showOnDisplay } from './oven.js';
import { findTray, slotPosition, placeTray, moveTray } from './tray.js';
import { initSmoke, updateSmoke, smokeLevel, overSmoke, puffSmoke } from './smoke.js';
import { initFlames, updateFlames, flareLevel } from './flames.js';
import { initKnob, hitsKnob, turnKnob, setTemperature, shownTemperature, heatLevel, bakeSpeed, NORMAL } from './knob.js';
import { setAlarm } from './alarm.js';

const UP = new THREE.Vector3( 0, 1, 0 );
const CARRY_HEIGHT = 1.0; // a dragged cookie floats this high, over the counters
const CARRY_X = [ - 1.2, 2.2 ];
const CARRY_Z = [ - 1.25, 0.6 ];
const TRAY_HEIGHT = 0.96; // a dragged tray's middle floats this high, just over the counter
const TRAY_X = [ 0.6, 2.1 ];
const TRAY_Z = [ - 1.68, - 0.75 ];

// the view of the tray and the oven, once the cookies are all on the tray
const OVEN_VIEW = { position: new THREE.Vector3( 1.15, 1.4, - 0.2 ), target: new THREE.Vector3( 1.45, 0.62, - 1.5 ) };
const ROUNDING = 0.0015; // a cookie's middle is this far over what it lies on (see cutting/cuts.js)

// where the tray goes on its way into the oven: in front of the open door, then on the rack
const OVEN_FRONT = new THREE.Vector3( 1.88, 0.47, - 1.0 );
const OVEN_INSIDE = new THREE.Vector3( 1.88, 0.421, - 1.72 );

let camera = null;
let controls = null;
let tray = null; // see tray.js

let dragging = null; // what's being dragged: { cookie, index } or { tray: true }
let overTarget = false; // and it's where it can be dropped right now (a cookie on the tray, the tray on the oven)
let guided = false;
const trayAt = new THREE.Vector3(); // where a dragged tray is going
let shown = ''; // what the oven's display shows now
let bakedFor = 0; // how long they've baked, in seconds as if at 180° (the knob makes it go faster or slower)
let saveIn = 0; // seconds until that's saved again
let knobShownFor = 0; // the display shows the temperature for a moment after the knob's turned
const SMOKE_ALARM = 0.3; // the alarm goes off when the smoke's this thick

const pointer = new THREE.Vector2( 2, 2 );
const raycaster = new THREE.Raycaster();
const carryPlane = new THREE.Plane( UP, - CARRY_HEIGHT );
const trayPlane = new THREE.Plane( UP, - TRAY_HEIGHT );
const carryAt = new THREE.Vector3();

// ---------- helpers ----------
// how long they've been in, on the clock
function realSeconds() {

	const { bakeStart } = getState();
	return bakeStart === null ? 0 : ( Date.now() - bakeStart ) / 1000;

}

function resultFor( s ) {

	if ( s < UNDERBAKED_UNTIL ) return 'under';
	if ( s < BURNT_FROM ) return 'perfect';
	return 'burnt';

}

// the cookies still on the dough
function looseCookies() {

	const { onTray } = getState();
	return cuts.filter( ( c, i ) => ! onTray.includes( i ) ).map( ( c ) => c.cookie );

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

// fly a cookie to `to` along an arc
function flyCookie( cookie, to, duration = 0.5 ) {

	const from = cookie.position.clone();
	return animate( duration, ( k ) => {

		cookie.position.lerpVectors( from, to, ease( k ) );
		cookie.position.y += Math.sin( Math.PI * k ) * 0.12;

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

	const { cut, baking, baked, busy } = getState();
	if ( ! cut || baking || baked || busy ) return;

	if ( trayReady() ) {

		if ( ! hitsTray( raycaster ) ) return;
		dragging = { tray: true };
		trayAt.copy( tray.centre );
		openDoor( true ); // ready for it
		controls.enabled = false;
		hideGuide();
		return;

	}

	const hit = raycaster.intersectObjects( looseCookies(), false )[ 0 ];
	if ( ! hit ) return;

	dragging = { cookie: hit.object, index: cuts.findIndex( ( c ) => c.cookie === hit.object ) };
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
	else if ( dropped.tray ) dropTray();
	else dropCookie( dropped );

}

// a cookie: onto the tray if it's over it, otherwise back where it was cut
async function dropCookie( { cookie, index } ) {

	if ( ! overTarget ) {

		flyCookie( cookie, cookie.userData.cutAt );
		return;

	}

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
	bakedFor = 0;
	setState( { busy: false, baking: true, bakeStart: Date.now(), bakeProgress: { seconds: 0, at: Date.now() }, baked: null } );
	guideBaking();

}

async function takeOut() {

	const result = { result: resultFor( bakedFor ), seconds: Math.round( bakedFor * 10 ) / 10, real: Math.round( realSeconds() ), temperature: shownTemperature() };
	bakeLevel.value = bakedFor / BAKE_PERFECT;
	setState( { baking: false, busy: true } );
	showOvenTimer( null );
	hideGuide();

	// (opening the door lets out a puff of smoke if it's smoky in there)
	const door = openDoor( true );
	if ( smokeLevel() > 0.1 ) puffSmoke( 0.4 );
	await door;
	await moveTray( tray, OVEN_FRONT, { duration: 0.6 } );
	await moveTray( tray, tray.centre, { duration: 0.9, lift: 0.15 } );
	await openDoor( false );
	setState( { busy: false, baked: result } );
	showBakeResult( result, bakeAgain );

}

// another go: the same cookies, raw again, ready to go back into the oven
function bakeAgain() {

	bakeLevel.value = 0;
	setState( { baked: null, bakeStart: null, bakeProgress: null } );
	guideTray();

}

// ---------- the tutorial ----------
function guideDragging() {

	if ( guided ) return;
	guided = true;
	showGuide( { icon: '🍪', text: 'Put the cookies on the baking tray', small: 'Hold the mouse on a cookie and drop it on the tray next to the oven, one by one', motion: 'drag' } );

}

function guideTray() {

	showGuide( { icon: '🔥', text: 'Now put the tray in the oven', small: 'Hold the mouse on the baking tray and drag it into the oven', motion: 'drag' } );

}

function guideBaking() {

	showGuide( { icon: '⏱️', text: 'Keep an eye on the clock!', small: `About ${ BAKE_PERFECT } seconds at ${ NORMAL }° makes them perfect: turn the knob for hotter (faster) or cooler (slower). Click the oven to take them out`, motion: 'circle' } );
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
	if ( dragging?.cookie ) return { text: overTarget ? 'let go to put it on the baking tray' : 'drag it onto the baking tray', clickable: false };

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
	if ( ! cut ) return { text: onTrayNow ? 'Baking Tray · for the cookies, once they\'re cut' : 'Oven · for baking the cookies, once they\'re cut', clickable: false };
	if ( loose.includes( hit.object ) ) return { text: `${ hit.object.userData.shape === 'star' ? 'Star Cookie' : 'Cookie' } · drag it onto the baking tray`, clickable: ! busy };
	if ( trayReady() ) return onTrayNow ? { text: 'Baking Tray · drag it into the oven', clickable: ! busy } : { text: 'Oven · drag the baking tray in here', clickable: false };
	if ( onTrayNow ) return { text: `Baking Tray · drag the cookies here (${ onTray.length }/${ cuts.length })`, clickable: false };
	return { text: 'Oven · put the cookies on the baking tray first', clickable: false };

}

// a click: take the cookies out of the oven
export function tryBakingClick( ray ) {

	if ( ! tray ) return false;
	if ( dragging ) return true; // (letting go drops it)

	const { baking, busy } = getState();
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
	initOven( room );
	initKnob( room );
	initFlames( room );
	initSmoke( room );

	window.addEventListener( 'pointerdown', onPointerDown, { capture: true } );
	window.addEventListener( 'pointermove', setPointer );
	window.addEventListener( 'pointerup', () => { if ( dragging ) drop(); } );
	window.addEventListener( 'blur', () => { if ( dragging ) { overTarget = false; drop(); } } );

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

			bakeLevel.value = saved.baked.seconds / BAKE_PERFECT;
			setState( { onTray, baked: saved.baked } );

		} else if ( full && saved.bakeStart !== null ) {

			// still in the oven: it kept baking while the page was away
			placeTray( tray, OVEN_INSIDE );
			const { seconds = 0, at = saved.bakeStart } = saved.bakeProgress ?? {};
			bakedFor = seconds + ( Date.now() - at ) / 1000 * bakeSpeed();
			setState( { onTray, baking: true, bakeStart: saved.bakeStart, bakeProgress: { seconds: bakedFor, at: Date.now() } } );

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

	// the cookies were just cut: show how to get them to the oven
	subscribe( ( state ) => { if ( state.cut && ! state.baking && ! state.baked && state.onTray.length === 0 ) guideDragging(); } );
	if ( cut && getState().onTray.length === 0 ) guideDragging();

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

	// a dragged cookie follows the mouse, floating over the counters
	} else if ( dragging?.cookie ) {

		raycaster.setFromCamera( pointer, camera );
		overTarget = hitsTray( raycaster );
		if ( raycaster.ray.intersectPlane( carryPlane, carryAt ) ) {

			carryAt.x = THREE.MathUtils.clamp( carryAt.x, ...CARRY_X );
			carryAt.z = THREE.MathUtils.clamp( carryAt.z, ...CARRY_Z );
			dragging.cookie.position.lerp( carryAt, 1 - Math.exp( - dt * 16 ) );

		}

	}

	// in the oven: they bake faster the hotter it is (saved now and then, for a refresh)
	const { baking } = getState();
	if ( baking ) {

		bakedFor += dt * bakeSpeed();
		bakeLevel.value = bakedFor / BAKE_PERFECT;
		saveIn -= dt;
		if ( saveIn <= 0 ) {

			saveIn = 1;
			setState( { bakeProgress: { seconds: bakedFor, at: Date.now() } } );

		}

	}

	const s = baking ? bakedFor : 0;

	// the oven's display: the temperature for a moment after the knob's turned (and whenever
	// it's not baking), otherwise the clock
	knobShownFor -= dt;
	const showKnob = dragging?.knob || knobShownFor > 0 || ! baking;
	const text = showKnob ? `${ shownTemperature() }°` : clock( realSeconds() );
	const warn = ! showKnob && s >= BURNT_FROM;
	if ( text + warn !== shown ) {

		shown = text + warn;
		showOnDisplay( text, { warn } );

	}

	// the fire: higher the hotter the oven's set, flaring when the door opens; it follows the
	// mouse while that's over the oven
	raycaster.setFromCamera( pointer, camera );
	const overOven = ! dragging && hitsOven( raycaster );
	updateFlames( dt, { target: baking ? 0.45 + 0.55 * heatLevel() + 0.1 * Math.min( 1, s / ( BURNT_FROM + 10 ) ) : 0, ray: raycaster.ray, overOven } );
	setHeat( ( baking ? 0.6 + 0.6 * heatLevel() : 0 ) + flareLevel(), performance.now() / 1000 );

	// smoke (a Shadertoy shader too, see shaders/smoke.js): from 45 seconds, when they start to
	// burn, thicker and darker until they're black; it clears once they're out, or for a while
	// when it's waved away. Thick smoke sets off the alarm and hides the clock
	const smoking = baking ? THREE.MathUtils.clamp( ( s - ( BURNT_FROM - 5 ) ) / 15, 0, 1 ) : 0;
	updateSmoke( dt, { target: smoking, darkness: THREE.MathUtils.clamp( ( s - BURNT_FROM ) / 10, 0, 1 ), ray: raycaster.ray, camera } );
	const smoke = smokeLevel();
	setAlarm( smoke > SMOKE_ALARM );
	if ( baking ) showOvenTimer( realSeconds(), { temperature: shownTemperature(), smoke, alarm: smoke > SMOKE_ALARM } );

}
