// the decorating step: once the cookies come out of the oven perfectly baked, the baking tray goes
// back to the table (what was lying where it goes is cleared away), the piping bag and the bowls
// of chocolate chips and sprinkles are set out next to it, and the view looks down on it all.
// Then it's done with the things on the table (click one to pick it up, or use the panel):
//   the piping bag   hold the mouse to squeeze it: icing comes out of the nozzle, falls onto the
//                    cookie, piles up and flows the way icing does. Pick its colour on the colour
//                    wheel (change it as often as you like: the colours stay where they're piped)
//   chips, sprinkles hold the mouse to tip the bowl: they pour out and fall, bounce and settle on
//                    the cookies (stuck where they land in icing), or on the paper if they miss
//   wipe off         rubs off what's under the mouse
// Esc puts down what's in the hand. "All done" says well done; the cookies stay as they are, and a
// refresh keeps them.
//   cookieDecor.js  what's on one cookie (and the icing's flowing)   icing.js  the icing coming out
//   pieces.js  the chips and sprinkles falling, and what's spilled   props.js  the bag and the bowls
//   colorWheel.js  the colour picker
import * as THREE from 'three/webgpu';
import { getState, setState, subscribe } from '../core/state.js';
import { loadDecor } from '../core/progress.js';
import { scene, camera, controls } from '../core/stage.js';
import { cuts } from '../cutting/cuts.js';
import { placeTray, moveTray, slotPosition } from '../baking/tray.js';
import { bakingTray } from '../baking/index.js';
import { moveCameraTo } from '../core/views.js';
import { animate, ease } from '../core/sequence.js';
import { TABLE_TOP } from '../core/table.js';
import { showGuide, hideGuide } from '../ui.js';
import { CookieDecor } from './cookieDecor.js';
import { IcingStream } from './icing.js';
import { initLook, Falling, Spills } from './pieces.js';
import { initProps, setOut, pickUp, putDown, heldProp, updateProps, setIcingColor, props } from './props.js';
import { colorWheel } from './colorWheel.js';
import { initShare, openShare, sharing } from './share.js';

// where the tray goes on the table (its middle), and the view that looks down on it and the
// things set out next to it
const SPOT = new THREE.Vector3( 0.08, TABLE_TOP + 0.016, 0.05 );
const VIEW = { position: new THREE.Vector3( 0.12, 1.45, 0.55 ), target: new THREE.Vector3( 0.12, 0.79, 0.03 ) };
const CLEAR = new THREE.Box3( new THREE.Vector3( - 0.2, 0, - 0.3 ), new THREE.Vector3( 0.56, 3, 0.27 ) ); // what's cleared off the table
const KEEP = /Table|Tray|Paper|Candle|Snow|Frost|Christmas|Chips_Bowl|Sprinkles_Bowl|Piping_Bag|Hand$/i;
const POUR = { chips: 14, sprinkles: 120 }; // pieces a second, pouring hard

let room = null;
let active = false;
let tool = null; // 'icing' | 'chips' | 'sprinkles' | 'wipe' | null
let thickness = 0.0017; // the rope of icing's radius
let color = '#f7b7cf';
const icingColor = new THREE.Color( color );
let pressing = false;
let wiping = null; // the last spot wiped (in the world)
let notice = '';
let noticeFor = 0;
let dirty = false; // something's changed that hasn't been saved
let settling = false; // icing is still flowing (it's saved again when it stops)
let saveIn = 0;
let viewHeld = false; // the view's not turning with the mouse button (it's working a tool)
let userMoved = false; // the view has been moved about (so it isn't put back when the window changes shape)
let dock = 0; // how much of the bottom of the screen the panel covers, on a small screen
let paperY = 0;
let poured = 0; // pieces due to pour out (fractions add up)

let stream = null; // the icing in the air
let falling = null; // chips and sprinkles in the air
let spills = null; // and what's landed on the paper
const decors = []; // one for each cookie, in order
const trayInside = new THREE.Box3();

const pointer = new THREE.Vector2( 2, 2 );
const raycaster = new THREE.Raycaster();
const local = new THREE.Vector3();
const point = new THREE.Vector3();
const workPlane = new THREE.Plane();
const propBox = new THREE.Box3();
const ring = new THREE.Mesh( new THREE.RingGeometry( 0.86, 1, 40 ).rotateX( - Math.PI / 2 ), new THREE.MeshBasicNodeMaterial( { transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide } ) );
ring.renderOrder = 20;
ring.visible = false;

const panel = document.getElementById( 'decorate' );
const toolButtons = [ ...panel.querySelectorAll( '[data-tool]' ) ];
const doneCard = document.getElementById( 'decorated-done' );

// ---------- what's under a point ----------
// what something falling at `at` (in the world) lands on: a cookie (how high its top, or the icing
// on it, is there, and where on it), or the baking paper
function ground( at ) {

	for ( const decor of decors ) {

		local.copy( at ).applyMatrix4( decor.inverse );
		if ( Math.abs( local.x - decor.x0 - decor.extent / 2 ) > decor.extent / 2 || Math.abs( decor.y0 - decor.extent / 2 - local.y ) > decor.extent / 2 ) continue;
		if ( ! decor.catches( local.x, local.y ) ) continue;
		const depth = decor.depthAt( local.x, local.y );
		return { y: decor.baseY + decor.top + depth, decor, x: local.x, y2: local.y, depth };

	}

	return { y: paperY, decor: null, depth: 0 };

}

// where the mouse points on the tray (and over the cookies on it), or null
function workPoint() {

	raycaster.setFromCamera( pointer, camera );
	const up = new THREE.Vector3( 0, 1, 0 );

	// first, is the mouse over the top of a cookie (or the icing on it)? The ray is checked against
	// each cookie's own top surface, which is higher than the paper: so what's under the pointer on
	// the screen is what it picks, even right at the edge of a cookie
	for ( const decor of decors ) {

		let height = decor.baseY + decor.top;
		for ( let i = 0; i < 3; i ++ ) {

			workPlane.set( up, - height );
			if ( ! raycaster.ray.intersectPlane( workPlane, point ) ) break;
			local.copy( point ).applyMatrix4( decor.inverse );
			if ( ! decor.catches( local.x, local.y ) ) {

				height = - Infinity; // (not over this cookie)
				break;

			}

			height = decor.baseY + decor.top + decor.depthAt( local.x, local.y ); // (the icing's height, if there's icing: try again there)

		}

		if ( height === - Infinity ) continue;
		workPlane.set( up, - height );
		if ( ! raycaster.ray.intersectPlane( workPlane, point ) ) continue;
		local.copy( point ).applyMatrix4( decor.inverse );
		if ( ! decor.catches( local.x, local.y ) ) continue;
		point.y = height;
		return point;

	}

	// otherwise it's over the paper
	workPlane.set( up, - paperY );
	if ( ! raycaster.ray.intersectPlane( workPlane, point ) ) return null;
	if ( point.x < trayInside.min.x || point.x > trayInside.max.x || point.z < trayInside.min.z || point.z > trayInside.max.z ) return null;
	point.y = paperY;
	return point;

}

// where the mouse is over the table (not only the tray), for a tool in the hand to follow
const tableSpot = new THREE.Vector3();
function tableAt() {

	raycaster.setFromCamera( pointer, camera );
	workPlane.set( new THREE.Vector3( 0, 1, 0 ), - ( paperY + 0.01 ) );
	if ( ! raycaster.ray.intersectPlane( workPlane, tableSpot ) ) return null;
	if ( tableSpot.x < - 0.8 || tableSpot.x > 0.8 || tableSpot.z < - 0.55 || tableSpot.z > 0.27 ) return null;
	return tableSpot;

}

function hitProp() {

	raycaster.setFromCamera( pointer, camera );
	for ( const name of Object.keys( props ) ) {

		if ( name === heldProp() ) continue;
		const { object } = props[ name ];
		if ( ! raycaster.ray.intersectsBox( propBox.setFromObject( object ) ) ) continue; // (a quick look first)
		if ( raycaster.intersectObject( object, true ).length > 0 ) return name;

	}

	return null;

}

function say( text ) {

	notice = text;
	noticeFor = 2.5;

}

// remember what's on the cookies (and so, across a refresh)
function save() {

	dirty = false;
	setState( { decor: { cookies: decors.map( ( d ) => d.toSaved() ), spills: spills.toSaved() } } );

}

// ---------- landing ----------
function landIcing( bit, under, volume ) {

	if ( under.decor ) under.decor.pour( under.x, under.y2, volume, bit.r * 1.3, bit.color );
	else spills.add( 'i', bit.at.clone().setY( paperY ), { size: Math.cbrt( volume / 2.6 ), color: `#${ bit.color.getHexString() }` } );
	dirty = true;

}

function landPiece( piece, under ) {

	const a = Math.random() * Math.PI * 2;
	if ( under.decor && under.decor.place( piece.t, under.x, under.y2, under.depth, a, piece.k ) ) {

		dirty = true;
		return;

	}

	if ( under.decor ) {

		say( piece.t === 'c' ? 'That cookie has plenty of chocolate chips: wipe some off to add more' : 'That cookie has plenty of sprinkles: wipe some off to add more' );
		return;

	}

	spills.add( piece.t, piece.at.clone().setY( paperY ), { a, k: piece.k } );
	dirty = true;

}

// ---------- clearing the table ----------
// whatever stands where the tray and the decorating things go (the bowl, the dough that's left,
// the cookie cutters) is put away
function tidy() {

	const size = new THREE.Vector3();
	const box = new THREE.Box3();
	const ours = new Set( [ ring, stream?.balls, stream?.tubes, falling?.chips, falling?.sprinkles ] );
	const away = [];
	for ( const parent of [ scene, room ] ) {

		for ( const object of parent.children ) {

			if ( object === room || object.isLight || ! object.visible || KEEP.test( object.name ) || ours.has( object ) ) continue;
			box.setFromObject( object );
			if ( box.isEmpty() || box.min.y < TABLE_TOP - 0.05 || box.min.y > TABLE_TOP + 0.2 ) continue;
			box.getSize( size );
			if ( size.x > 0.9 || size.z > 0.9 ) continue;
			if ( box.min.x < CLEAR.max.x && box.max.x > CLEAR.min.x && box.min.z < CLEAR.max.z && box.max.z > CLEAR.min.z ) away.push( object );

		}

	}

	const sizes = away.map( ( o ) => o.scale.clone() );
	return animate( 0.35, ( k ) => {

		away.forEach( ( o, i ) => o.scale.copy( sizes[ i ] ).multiplyScalar( Math.max( 1 - ease( k ), 0.001 ) ) );

	} ).then( () => away.forEach( ( o, i ) => {

		o.visible = false;
		o.scale.copy( sizes[ i ] );

	} ) );

}

// the view, pulled back on a tall, narrow screen so the whole tray still fits across it (and above
// the panel, when that's at the bottom)
function fittedView() {

	const back = THREE.MathUtils.clamp( 1.5 / ( window.innerWidth / Math.max( window.innerHeight - dock, 200 ) ), 1, 2.8 );
	return { position: VIEW.target.clone().lerp( VIEW.position, back ), target: VIEW.target };

}

// ---------- the view ----------
// The view is the same free one as the rest of the game: drag to turn it, scroll to zoom in on what
// the mouse is over, right-drag to move it. (While a tool is in the hand, the left button works
// the tool instead: the view still moves with the right button and the wheel.)
const MIN_DISTANCE = 0.14; // how close it can zoom (the table's collision keeps it well above it)

// zoom the way the buttons do: closer or further along the way the camera looks
function dolly( factor ) {

	const away = camera.position.clone().sub( controls.target );
	const distance = THREE.MathUtils.clamp( away.length() / factor, MIN_DISTANCE, 2.5 );
	camera.position.copy( controls.target ).addScaledVector( away.normalize(), distance );

}

// back to the view of the whole tray
function wholeTray() {

	setState( { busy: true } );
	return moveCameraTo( fittedView(), { duration: 0.8, release: true } ).then( () => setState( { busy: false } ) );

}

// ---------- starting ----------
async function start( { instantly = false } = {} ) {

	if ( active ) return;
	active = true;
	document.body.classList.add( 'decorating' );
	hideGuide();
	const tray = bakingTray();

	panel.classList.add( 'show' );
	updateDock();
	controls.zoomToCursor = true; // (the wheel zooms in on what the mouse is over)
	controls.minDistance = MIN_DISTANCE;

	if ( instantly ) {

		await tidy();
		placeTray( tray, SPOT );
		setOut( TABLE_TOP, { instantly: true } );
		camera.position.copy( fittedView().position );
		controls.target.copy( VIEW.target );

	} else {

		setState( { busy: true } );
		await tidy();
		await Promise.all( [
			moveTray( tray, SPOT, { duration: 1.3, lift: 0.25 } ),
			setOut( TABLE_TOP ),
			moveCameraTo( fittedView(), { duration: 1.3 } ),
		] );
		setState( { busy: false, decorating: true } );

	}

	// the tray's where it stays now: where its paper is, and its inside
	tray.mesh.updateMatrixWorld( true );
	paperY = slotPosition( tray, 0 ).y;
	trayInside.setFromObject( tray.mesh ).expandByVector( new THREE.Vector3( - 0.018, 0, - 0.018 ) );
	for ( const decor of decors ) updateFrame( decor );

	showGuide( { text: 'Perfectly baked! Time to decorate the cookies', small: 'Click the piping bag, the chocolate chips or the sprinkles to pick them up, then hold the mouse over a cookie to ice them or pour on the toppings', motion: 'circle' } );
	setTimeout( () => hideGuide(), 14000 );

}

// where a cookie is in the world, for working out what lands on it
function updateFrame( decor ) {

	decor.cookie.updateMatrixWorld( true );
	decor.inverse.copy( decor.cookie.matrixWorld ).invert();
	decor.baseY = new THREE.Vector3().setFromMatrixPosition( decor.cookie.matrixWorld ).y;

}

// ---------- the tools ----------
function selectTool( name ) {

	if ( name === tool ) {

		// (the same one again: put it down)
		putDown();
		name = null;

	} else if ( name === 'wipe' ) putDown();
	else pickUp( name );

	tool = name;
	for ( const button of toolButtons ) {

		const on = button.dataset.tool === name;
		button.classList.toggle( 'on', on );
		button.setAttribute( 'aria-pressed', String( on ) );

	}

	panel.classList.toggle( 'icing-on', name === 'icing' );
	stream?.stop();
	updateDock();

}

// (on a small screen the panel is at the bottom: the hints move up out of its way, and the view
// shifts so the tray sits in what's left above it)
function updateDock() {

	dock = active && window.matchMedia( '(max-width: 760px)' ).matches ? panel.offsetHeight : 0;
	document.documentElement.style.setProperty( '--dock', `${ dock }px` );
	if ( dock > 0 ) camera.setViewOffset( window.innerWidth, window.innerHeight, 0, dock / 2, window.innerWidth, window.innerHeight );
	else if ( camera.view?.enabled ) camera.clearViewOffset();

}

function wipeAt( at ) {

	const radius = thickness * 6;
	for ( const decor of decors ) {

		local.copy( at ).applyMatrix4( decor.inverse );
		decor.wipe( local.x, local.y, radius );

	}

	spills.wipe( at, radius );
	dirty = true;

}

// ---------- the mouse ----------
function setPointer( e ) {

	pointer.set( ( e.clientX / window.innerWidth ) * 2 - 1, - ( e.clientY / window.innerHeight ) * 2 + 1 );

}

function onPointerDown( e ) {

	if ( ! active || e.button !== 0 || e.target !== controls.domElement || getState().busy || doneCard.classList.contains( 'show' ) || sharing() ) return;
	setPointer( e );

	// the piping bag and the bowls: picked up with a click (also instead of what's in the hand)
	const prop = hitProp();
	if ( prop ) {

		selectTool( prop );
		holdView();
		return;

	}

	// with something in the hand: on the tray it's used, anywhere else on the table it's put back
	if ( tool ) {

		holdView();
		if ( workPoint() === null ) {

			selectTool( tool );
			return;

		}

		pressing = true;
		wiping = null;

	}

	// (with nothing in the hand, the button turns the view, like everywhere else in the game)

}

// the left button works a tool for as long as it's down: it doesn't turn the view too
function holdView() {

	controls.enabled = false;
	viewHeld = true;

}

function onPointerMove( e ) {

	if ( active ) setPointer( e );

}

function onPointerUp() {

	pressing = false;
	wiping = null;
	stream?.stop();
	if ( viewHeld ) {

		viewHeld = false;
		if ( ! getState().busy ) controls.enabled = true;

	}

}

// ---------- hooks for interaction.js ----------
// the hover hint: { text, clickable }, false to show nothing, null if it's not this step
export function decoratingHint() {

	if ( ! active ) return null;
	if ( noticeFor > 0 ) return { text: notice, clickable: false };

	const prop = hitProp();
	if ( prop ) {

		const what = { icing: 'Piping Bag · click to pick it up and pipe icing', chips: 'Chocolate Chips · click to pick up the bowl', sprinkles: 'Sprinkles · click to pick up the bowl' }[ prop ];
		return { text: what, clickable: true };

	}

	const over = workPoint() !== null;
	const name = { icing: 'the piping bag', chips: 'the chocolate chips', sprinkles: 'the sprinkles', wipe: 'the wiper' }[ tool ];
	if ( tool && ! over ) return { text: `Click on the table to put ${ name } back · or move it over the cookies`, clickable: true };
	if ( tool === 'icing' ) return { text: 'Hold the mouse to squeeze the piping bag · click beside the tray or press Esc to put it back', clickable: false };
	if ( tool === 'chips' || tool === 'sprinkles' ) return { text: `Hold the mouse to tip the bowl and pour ${ name } · click beside the tray or press Esc to put it back`, clickable: false };
	if ( tool === 'wipe' ) return { text: 'Hold the mouse and drag to rub off icing, chips and sprinkles · click beside the tray to stop', clickable: false };
	return { text: 'Pick up the piping bag, the chocolate chips or the sprinkles · drag to turn the view, scroll to zoom', clickable: false };

}

// a click while decorating is all about decorating (nothing else on the table can be picked up)
export function tryDecoratingClick() {

	return active;

}

export function decorating() {

	return active;

}

// ---------- setup and every frame ----------
export function initDecorating( { room: kitchen } ) {

	room = kitchen;
	scene.add( ring );
	initLook( room );
	initProps( room );
	const tray = bakingTray();
	if ( ! tray ) return;

	stream = new IcingStream( scene );
	falling = new Falling( scene );
	spills = new Spills( tray.mesh, stream.material );
	cuts.forEach( ( cut ) => {

		const decor = new CookieDecor( cut );
		decor.inverse = new THREE.Matrix4();
		decor.baseY = 0;
		decors.push( decor );

	} );

	// the colour wheel and the sliders
	colorWheel( {
		canvas: document.getElementById( 'wheel' ),
		shade: document.getElementById( 'shade' ),
		swatches: document.getElementById( 'swatches' ),
		preview: document.getElementById( 'color-preview' ),
		label: document.getElementById( 'color-hex' ),
		onChange: ( value ) => {

			color = value;
			icingColor.set( value );
			setIcingColor( value );
			stream.stop(); // (a new colour is a new rope)

		},
	} );
	const size = document.getElementById( 'brush' );
	size.addEventListener( 'input', () => { thickness = size.value / 10000; } );
	thickness = size.value / 10000;

	for ( const button of toolButtons ) button.addEventListener( 'click', () => selectTool( button.dataset.tool ) );

	initShare();
	const shareButton = document.getElementById( 'decorated-share' );
	document.getElementById( 'decorate-done' ).addEventListener( 'click', () => {

		if ( dirty ) save();
		if ( tool ) selectTool( tool ); // (puts down what's in the hand)
		const any = decors.some( ( d ) => d.decorated );
		shareButton.disabled = ! any;
		document.getElementById( 'decorated-note' ).textContent = any ? '' : 'Decorate a cookie first, then you can put it on a Christmas card.';
		doneCard.classList.add( 'show' );
		( any ? shareButton : document.getElementById( 'decorated-keep' ) ).focus();

	} );

	// the decorated cookies, on a plate, on a Christmas card
	shareButton.addEventListener( 'click', () => {

		doneCard.classList.remove( 'show' );
		openShare( decors.filter( ( d ) => d.decorated ).map( ( d ) => d.cookie ) );

	} );
	document.getElementById( 'decorated-keep' ).addEventListener( 'click', () => doneCard.classList.remove( 'show' ) );
	window.addEventListener( 'keydown', ( e ) => {

		if ( e.key !== 'Escape' || ! active ) return;
		if ( doneCard.classList.contains( 'show' ) ) doneCard.classList.remove( 'show' );
		else if ( tool ) selectTool( tool ); // (puts it down)

	} );
	window.addEventListener( 'resize', () => {

		updateDock();
		if ( active && ! getState().busy && ! userMoved ) camera.position.copy( fittedView().position ); // (the window changed shape)

	} );
	if ( window.ResizeObserver ) new ResizeObserver( updateDock ).observe( panel );

	window.addEventListener( 'pointerdown', onPointerDown, { capture: true } );
	window.addEventListener( 'pointermove', onPointerMove );
	window.addEventListener( 'pointerup', onPointerUp );
	window.addEventListener( 'blur', onPointerUp );
	controls.addEventListener( 'start', () => { userMoved = true; } );
	document.getElementById( 'zoom-in' ).addEventListener( 'click', () => { userMoved = true; dolly( 1.4 ); } );
	document.getElementById( 'zoom-out' ).addEventListener( 'click', () => { userMoved = true; dolly( 1 / 1.4 ); } );
	document.getElementById( 'zoom-fit' ).addEventListener( 'click', () => { userMoved = false; wholeTray(); } );

	// the "decorate" button on the baking result card
	subscribe( ( { decorating: on } ) => { if ( on && ! active ) start(); } );

	// where it was left, before a page refresh
	const saved = loadDecor();
	const { baked, onTray } = getState();
	if ( saved.decorating && baked?.result === 'perfect' && cuts.length > 0 && onTray.length === cuts.length ) {

		decors.forEach( ( decor, i ) => { if ( saved.decor.cookies?.[ i ] ) decor.fromSaved( saved.decor.cookies[ i ] ); } );
		spills.fromSaved( saved.decor.spills );
		start( { instantly: true } ); // (first: it's what answers to "decorating" being set)
		setState( { decorating: true, decor: saved.decor } );

	} else if ( saved.decorating ) setState( { decorating: false, decor: {} } );

}

export function updateDecorating( dt ) {

	if ( ! active ) return;
	noticeFor -= dt;
	if ( getState().busy ) return;

	// where the cookies are is checked every frame, not just when decorating started: if the tray
	// or a cookie is moved after that (a late animation, a different frame rate), what lands on a
	// cookie still lands where the cookie really is
	const tray = bakingTray();
	tray.mesh.updateMatrixWorld( true );
	paperY = slotPosition( tray, 0 ).y;
	for ( const decor of decors ) updateFrame( decor );

	const busy = doneCard.classList.contains( 'show' ) || sharing();
	const at = busy ? null : workPoint();

	// the piping bag or a bowl, in the hand
	// (it follows the mouse anywhere over the table, but only works over the tray)
	const where = at ?? ( busy ? null : tableAt() );
	const doing = updateProps( dt, { point: where ? where.clone() : null, pressing: pressing && ! busy && at !== null, camera } );
	if ( doing.squeezing ) stream.squeeze( dt, { ...doing.squeezing, radius: thickness, color: icingColor } );
	else stream.stop();

	if ( doing.pouring ) {

		// they tumble out over the lip, more the further it's tipped
		const kind = doing.holding === 'chips' ? 'c' : 's';
		poured += dt * POUR[ doing.holding ] * doing.pouring.amount;
		for ( ; poured >= 1; poured -= 1 ) {

			// out over the lip (a little spread along it), barely moving sideways: they fall straight
			// onto what the mouse is over
			const side = new THREE.Vector3().crossVectors( doing.pouring.toward, new THREE.Vector3( 0, 1, 0 ) ).multiplyScalar( ( Math.random() - 0.5 ) * 0.03 );
			const from = doing.pouring.lip.clone().add( side );
			const velocity = new THREE.Vector3( ( Math.random() - 0.5 ) * 0.03, - 0.04, ( Math.random() - 0.5 ) * 0.03 ).addScaledVector( doing.pouring.toward, 0.02 );
			falling.spawn( kind, from, velocity );

		}

	}

	// wiping: along the way the mouse went
	if ( tool === 'wipe' && pressing && at ) {

		const from = wiping ?? at;
		const steps = Math.max( 1, Math.ceil( from.distanceTo( at ) / ( thickness * 3 ) ) );
		for ( let i = 1; i <= steps; i ++ ) wipeAt( from.clone().lerp( at, i / steps ) );
		wiping = at.clone();

	}

	// everything in the air, and the icing flowing
	stream.update( dt, { ground, land: landIcing } );
	falling.update( dt, { ground, bounds: trayInside, rest: landPiece } );
	let flowing = false;
	for ( const decor of decors ) {

		decor.settle( Math.min( dt, 1 / 30 ) );
		decor.update();
		flowing ||= decor.moving;

	}

	// saved once nothing's in the air (and again when the icing's stopped flowing), at most once a second
	if ( flowing ) settling = true;
	else if ( settling ) {

		settling = false;
		dirty = true;

	}

	saveIn -= dt;
	if ( dirty && saveIn <= 0 && ! pressing && ! stream.busy && ! falling.busy ) {

		save();
		saveIn = 1;

	}

	// a ring where it'll land (or what wiping takes off)
	ring.visible = at !== null && ( tool === 'wipe' || heldProp() !== null );
	if ( ring.visible ) {

		ring.position.copy( at ).y += 0.0015;
		ring.scale.setScalar( tool === 'wipe' ? thickness * 6 : tool === 'icing' ? thickness * 1.6 : 0.012 );
		ring.material.color.set( tool === 'icing' ? color : tool === 'wipe' ? '#ff8a8a' : '#ffffff' );

	}

}
