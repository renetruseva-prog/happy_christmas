// the cutting step: once the dough is rolled out, cut cookies out of it, two ways:
// - pick up one of the star cutters: it hangs over the table and follows the mouse; click the
//   dough to press it in and cut a star (scroll turns it). Esc, or a click off the dough, puts
//   it back; clicking another cutter swaps them
// - with no cutter in hand, hold the mouse button on the dough and draw a shape; let go back
//   where you started and it's cut out
// A cookie has to fit on the dough, away from its edge and from the cookies already cut. There's
// room for COOKIE_COUNT of them: the star cutters shrink to cookie size when picked up (and a bit
// more if the dough gets crowded), and drawn shapes can't be too big. Once they're all cut, a
// card says so (or if the dough is full before that, though that's hard to manage).
//   outline.js  the shapes    cuts.js  the cookies and the holes they leave
//   trace.js  the line you draw
import * as THREE from 'three/webgpu';
import { getState, setState, subscribe } from '../state.js';
import { COOKIE_COUNT, CUTTER_SCALE, MAX_SHAPE_RADIUS } from '../config.js';
import { showGuide, hideGuide, showCookiesDone } from '../ui.js';
import { runSequence, animate, ease } from '../sequence.js';
import { loadCookies, loadCut } from '../progress.js';
import { TABLE_TOP } from '../table.js';
import { rolledDough } from '../rolling/index.js';
import { SHEET_THICKNESS } from '../rolling/dough.js';
import { starOutline, area, selfIntersects, resample, smooth, bounds } from './outline.js';
import { initCuts, cut, cuts, whyNot, inCut, toSaved, fromSaved } from './cuts.js';
import { Trace } from './trace.js';

const UP = new THREE.Vector3( 0, 1, 0 );
const SURFACE = TABLE_TOP + SHEET_THICKNESS; // the top of the rolled-out dough
const HOVER = 0.035; // how high a cutter in hand hangs over the dough
const REACH_X = [ - 0.75, 0.8 ]; // where over the table it can go
const REACH_Z = [ - 0.45, 0.35 ];
const TURN_STEP = Math.PI / 12; // one scroll turns the cutter 15°
const CLOSE = 0.025; // letting go this close to the start closes the shape
const MIN_AREA = 0.0008; // the smallest shape worth cutting (about 3 × 3 cm)
const SMALLER = [ CUTTER_SCALE, CUTTER_SCALE * 0.85, CUTTER_SCALE * 0.7 ]; // the cutters' sizes, if the dough gets crowded

let room = null;
let camera = null;
let controls = null;
let dough = null;
let trace = null;

const cutters = []; // { mesh, home: { position, quaternion, scale }, turnedTo }
let cutterScale = CUTTER_SCALE; // how big the stars are cut (of the cutters' size in the kitchen)
let held = null; // the cutter in hand
let following = false; // it's over the table, following the mouse (not on its way)
let pressing = false; // being pressed into the dough right now
let drawing = false; // a shape is being drawn
let notice = null; // a short message for the hover hint ("that doesn't fit"), and for how long
let noticeFor = 0;
let guided = false; // the tutorial was shown

const pointer = new THREE.Vector2( 2, 2 );
const raycaster = new THREE.Raycaster();
const surfacePlane = new THREE.Plane( UP, - SURFACE );
const aimAt = new THREE.Vector3();

// ---------- the mouse ----------
function setPointer( e ) {

	pointer.set( ( e.clientX / window.innerWidth ) * 2 - 1, - ( e.clientY / window.innerHeight ) * 2 + 1 );
	raycaster.setFromCamera( pointer, camera );

}

// where the mouse points on the dough's level, or null
function aim() {

	return raycaster.ray.intersectPlane( surfacePlane, aimAt ) ? { x: aimAt.x, z: aimAt.z } : null;

}

function rayHits( ray, object ) {

	return object && object.visible && ray.intersectObject( object, true ).length > 0;

}

// the cutter the ray hits, or null
function cutterAt( ray ) {

	const hit = ray.intersectObjects( cutters.map( ( c ) => c.mesh ), false )[ 0 ];
	return hit ? cutters.find( ( c ) => c.mesh === hit.object ) : null;

}

function say( text ) {

	notice = text;
	noticeFor = 2.5;

}

// ---------- the star cutters ----------
// fly a cutter along a small arc (shrinking or growing on the way)
function fly( mesh, { position, quaternion, scale }, duration = 0.4 ) {

	const fromP = mesh.position.clone();
	const fromQ = mesh.quaternion.clone();
	const fromS = mesh.scale.clone();
	return animate( duration, ( k ) => {

		mesh.position.lerpVectors( fromP, position, ease( k ) );
		mesh.position.y += Math.sin( Math.PI * k ) * 0.05;
		mesh.quaternion.slerpQuaternions( fromQ, quaternion, ease( k ) );
		mesh.scale.lerpVectors( fromS, scale, ease( k ) );

	} );

}

function hoverPose( cutter ) {

	const p = aim() ?? { x: dough.position.x, z: dough.position.z };
	const position = new THREE.Vector3( THREE.MathUtils.clamp( p.x, ...REACH_X ), SURFACE + HOVER, THREE.MathUtils.clamp( p.z, ...REACH_Z ) );
	const quaternion = cutter.home.quaternion.clone().premultiply( new THREE.Quaternion().setFromAxisAngle( UP, cutter.turnedTo ) );
	return { position, quaternion, scale: cutter.home.scale.clone().multiplyScalar( cutterScale ) };

}

async function grab( cutter ) {

	held = cutter;
	following = false;
	cutter.turnedTo = 0;
	controls.enabled = false; // the mouse works the cutter now, not the view
	setState( { cutting: true } );

	await fly( cutter.mesh, hoverPose( cutter ) ); // (it shrinks to cookie size on the way)
	if ( held === cutter ) following = true;

}

function putBack() {

	const cutter = held;
	held = null;
	following = false;
	fly( cutter.mesh, cutter.home, 0.45 );
	controls.enabled = true;
	setState( { cutting: false } );

}

// press the cutter into the dough, cut, and lift it out again
async function press() {

	const { mesh } = held;
	const outline = starOutline( mesh );
	const why = whyNot( outline );
	if ( why ) return say( why );

	pressing = true;
	const top = mesh.position.y;
	const down = TABLE_TOP + 0.0005;
	await runSequence( [
		{ duration: 0.12, update: ( k ) => { mesh.position.y = THREE.MathUtils.lerp( top, down, k * k ); } },
		{ duration: 0.1, start: () => addCookie( outline, 'star' ) },
		{ duration: 0.25, update: ( k ) => { mesh.position.y = THREE.MathUtils.lerp( down, top, ease( k ) ); } },
	] );
	pressing = false;
	if ( getState().cut ) putBack(); // that was the last one
	else if ( held ) held.mesh.scale.copy( hoverPose( held ).scale ); // (smaller if the dough is getting crowded)

}

// ---------- drawing your own shape ----------
// a press on the dough with no cutter in hand starts a shape. This runs before the view's own
// listener (capture), so the view doesn't turn while drawing
function onPointerDown( e ) {

	if ( e.button !== 0 || e.target !== controls.domElement ) return;
	const { rolled, cut: done, busy, mixing, rolling } = getState();
	if ( ! rolled || done || held || busy || mixing || rolling ) return;

	setPointer( e );
	const p = aim();
	if ( ! p || ! rayHits( raycaster, dough ) || inCut( p.x, p.z ) ) return;

	drawing = true;
	controls.enabled = false;
	setState( { cutting: true } );
	trace.start( p );

}

function onPointerMove( e ) {

	setPointer( e );
	if ( ! drawing ) return;

	const p = aim();
	if ( ! p ) return;
	trace.add( p );
	trace.showClosing( closes() );

}

// how far the line got from where it started
function farthest() {

	const first = trace.points[ 0 ];
	return Math.max( ...trace.points.map( ( p ) => Math.hypot( p.x - first.x, p.z - first.z ) ) );

}

// whether letting go now closes the shape: it went somewhere and came back to the start
function closes() {

	const { points } = trace;
	const last = points[ points.length - 1 ];
	return farthest() > CLOSE * 1.5 && Math.hypot( last.x - points[ 0 ].x, last.z - points[ 0 ].z ) < CLOSE;

}

function stopDrawing() {

	drawing = false;
	controls.enabled = true;
	setState( { cutting: false } );

}

// let go: cut the shape out if it's a good one
function finishDrawing() {

	const { points } = trace;
	const closed = closes();
	const small = farthest() <= CLOSE * 1.5;
	stopDrawing();
	trace.clear();

	if ( points.length < 3 ) return say( 'hold the mouse button and draw around a shape' );
	if ( small ) return say( 'draw a bigger shape' );
	if ( ! closed ) return say( 'the shape wasn\'t closed · let go back where you started' );

	// the end that comes back over the start is left off, then the shaky line is evened out
	const first = points[ 0 ];
	let end = points.length;
	while ( end > 3 && Math.hypot( points[ end - 1 ].x - first.x, points[ end - 1 ].z - first.z ) < 0.006 ) end --;
	const outline = smooth( resample( points.slice( 0, end ), 0.004 ) );

	if ( selfIntersects( outline ) ) return say( 'the outline crosses itself · try again' );
	if ( area( outline ) < MIN_AREA ) return say( 'draw a bigger shape' );
	if ( bounds( outline ).r > MAX_SHAPE_RADIUS ) return say( `draw a smaller shape · leave room for all ${ COOKIE_COUNT } cookies` );
	const why = whyNot( outline );
	if ( why ) return say( why );

	// it settles into place
	const cookie = addCookie( outline, 'drawn' );
	const y = cookie.position.y;
	animate( 0.25, ( k ) => { cookie.position.y = y + ( 1 - ease( k ) ) * 0.004; } );

}

// ---------- cutting ----------
function addCookie( outline, shape ) {

	const cookie = cut( outline, shape );
	const cookies = [ ...getState().cookies, toSaved( { shape, outline } ) ];
	setState( { cookies } );
	hideGuide();

	if ( cookies.length >= COOKIE_COUNT ) finish( `${ COOKIE_COUNT } cookies, ready to go on the baking tray.` );
	else {

		// the stars get a bit smaller if they wouldn't fit any more
		cutterScale = SMALLER.find( roomForStar );
		if ( ! cutterScale ) finish( `The dough is full, so that's ${ cookies.length } cookies, ready for the baking tray.` );

	}

	return cookie;

}

// whether a star of this size (of the cutters' own) still fits somewhere on the dough
function roomForStar( scale ) {

	const probe = new THREE.Object3D();
	probe.scale.setScalar( scale );
	const reach = Math.max( dough.scale.x, dough.scale.z );
	for ( let x = - reach; x <= reach; x += 0.015 ) {

		for ( let z = - reach; z <= reach; z += 0.015 ) {

			for ( let turn = 0; turn < Math.PI * 2 / 5; turn += Math.PI / 10 ) {

				probe.position.set( dough.position.x + x, TABLE_TOP, dough.position.z + z );
				probe.rotation.y = turn;
				if ( ! whyNot( starOutline( probe ) ) ) return true;

			}

		}

	}

	return false;

}

function finish( text ) {

	setState( { cut: true } );
	showCookiesDone( text );

}

function guide() {

	if ( guided ) return;
	guided = true;
	showGuide( {
		icon: '🍪',
		text: 'Cut out your cookies!',
		small: `There's room for ${ COOKIE_COUNT }: pick up a star cutter and click the dough, or hold the mouse and draw your own shape`,
		motion: 'star',
	} );

}

// ---------- hooks for interaction.js ----------
// the hover hint: { text, clickable }, false to show nothing, null if it's not about this step
export function cuttingHint( ray ) {

	if ( ! dough ) return null;
	const { rolled, rolling, mixing, busy, cut: done, cookies } = getState();
	if ( rolling || mixing ) return null;

	if ( notice ) return { text: notice, clickable: false };

	if ( drawing ) {

		if ( farthest() > MAX_SHAPE_RADIUS * 2 ) return { text: `that's getting big · leave room for all ${ COOKIE_COUNT } cookies`, clickable: false };
		return { text: closes() ? 'let go to cut out this shape' : 'draw all the way around, back to where you started', clickable: false };

	}

	const left = COOKIE_COUNT - cookies.length;
	const leftText = `${ left } more to cut`;

	if ( held ) {

		if ( pressing || ! following ) return false;
		const other = cutterAt( ray );
		if ( other && other !== held ) return { text: 'Star Cutter · click to take this one instead' };
		if ( ! rayHits( ray, dough ) ) return { text: 'move the cutter over the dough · click here or Esc to put it back' };
		const why = whyNot( starOutline( held.mesh ) );
		return why ? { text: why, clickable: false } : { text: `click to cut a star (${ leftText }) · scroll to turn it · Esc to put it back` };

	}

	const cutter = cutterAt( ray );
	if ( cutter && done ) return { text: 'Star Cutter · the cookies are all cut out', clickable: false };
	if ( cutter ) return rolled ? { text: `Star Cutter · pick up to cut cookie-sized stars (${ leftText })`, clickable: ! busy } : { text: 'Star Cutter · for cutting cookies once the dough is rolled out', clickable: false };
	if ( ! rolled ) return null;

	const hit = ray.intersectObjects( [ dough, ...cuts.map( ( c ) => c.cookie ) ], false )[ 0 ];
	if ( hit?.object === dough && ! inCut( hit.point.x, hit.point.z ) ) {

		if ( done ) return { text: 'Dough · the cookies are all cut out', clickable: false };
		return { text: `Dough · pick up a star cutter, or hold the mouse and draw your own shape (${ leftText })`, clickable: false };

	}

	if ( hit && hit.object !== dough ) return { text: hit.object.userData.shape === 'star' ? 'Star Cookie · cut out' : 'Cookie · your own shape', clickable: false };
	return null;

}

// a click: pick up a cutter, press it into the dough, swap it or put it back
export function tryCuttingClick( ray ) {

	if ( ! dough ) return false;
	if ( drawing ) return true; // (letting go finishes the shape)

	if ( held ) {

		if ( pressing || ! following ) return true;
		const other = cutterAt( ray );
		if ( other && other !== held ) {

			putBack();
			grab( other );

		} else if ( rayHits( ray, dough ) ) press();
		else putBack();
		return true;

	}

	const cutter = cutterAt( ray );
	const { rolled, busy, cut: done } = getState();
	if ( cutter && rolled && ! done && ! busy ) {

		grab( cutter );
		return true;

	}

	return false;

}

// ---------- setup and every frame ----------
export function initCutting( { room: kitchen, camera: cam, controls: ctrl } ) {

	room = kitchen;
	camera = cam;
	controls = ctrl;
	dough = rolledDough();
	if ( ! dough ) return;

	room.traverse( ( o ) => {

		if ( o.isMesh && o.name.startsWith( 'Cookie_Cutter' ) ) cutters.push( { mesh: o, home: { position: o.position.clone(), quaternion: o.quaternion.clone(), scale: o.scale.clone() }, turnedTo: 0 } );

	} );

	initCuts( dough );
	trace = new Trace( room, SURFACE );

	window.addEventListener( 'pointerdown', onPointerDown, { capture: true } );
	window.addEventListener( 'pointermove', onPointerMove );
	window.addEventListener( 'pointerup', () => { if ( drawing ) finishDrawing(); } );
	window.addEventListener( 'blur', () => { if ( drawing ) { stopDrawing(); trace.clear(); } } );
	window.addEventListener( 'wheel', ( e ) => { if ( held && following ) held.turnedTo += Math.sign( e.deltaY ) * TURN_STEP; } );
	window.addEventListener( 'keydown', ( e ) => {

		if ( e.key !== 'Escape' ) return;
		if ( held && following && ! pressing ) putBack();
		if ( drawing ) {

			stopDrawing();
			trace.clear();

		}

	} );

	// cut before a page refresh: cut them again, straight away
	const { rolled } = getState();
	if ( rolled ) {

		const saved = loadCookies().slice( 0, COOKIE_COUNT );
		for ( const c of saved ) cut( fromSaved( c ), c.shape );
		const done = loadCut() || saved.length >= COOKIE_COUNT;
		if ( ! done && saved.length > 0 ) cutterScale = SMALLER.find( roomForStar ) ?? SMALLER[ SMALLER.length - 1 ];
		setState( { cookies: saved, cut: done } );
		if ( saved.length === 0 ) guide();

	}

	// the dough was just rolled out: show how cutting works
	subscribe( ( state ) => { if ( state.rolled && ! state.rolling && ! state.cut && state.cookies.length === 0 ) guide(); } );

}

export function updateCutting( dt ) {

	if ( noticeFor > 0 ) {

		noticeFor -= dt;
		if ( noticeFor <= 0 ) notice = null;

	}

	// the cutter in hand follows the mouse over the table (and turns when scrolled)
	if ( held && following && ! pressing ) {

		raycaster.setFromCamera( pointer, camera );
		const { position, quaternion } = hoverPose( held );
		const k = 1 - Math.exp( - dt * 16 );
		held.mesh.position.lerp( position, k );
		held.mesh.quaternion.slerp( quaternion, k );

	}

}
