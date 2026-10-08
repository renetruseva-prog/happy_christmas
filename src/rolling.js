// rolling out the dough: once it's mixed, click the bowl to take the dough out onto a floured spot
// on the table, then pick up the rolling pin and roll it forward and back over the dough (hold the
// mouse button and move up and down, or move your hand forward and back in front of the camera)
// until it's a thin sheet. Only actually rolling over the dough thins it. Esc puts the pin down.
import * as THREE from 'three/webgpu';
import { color, float, mix, mx_noise_float, positionWorld, smoothstep, uniform, uv } from 'three/tsl';
import { ROLL_DISTANCE } from './config.js';
import { getState, setState } from './state.js';
import { showStatus, showGuide, hideGuide, guideShown } from './ui.js';
import { runSequence } from './sequence.js';
import { loadDoughProgress } from './progress.js';
import { bowlInfo, emptyBowl } from './pouring.js';
import { startHandTracking, stopHandTracking, updateHandTracking, isTracking, handPosition } from './handTracking.js';

const UP = new THREE.Vector3( 0, 1, 0 );
const TABLE_TOP = 0.78; // height of the table's surface
const TABLE_X = [ - 0.6, 0.6 ]; // where on the table the dough can go (with room for the rolled-out sheet)
const TABLE_Z = [ - 0.42, 0.12 ];
const BALL = { radius: 0.055, thickness: 0.05 }; // the dough as it comes out of the bowl
const SHEET_THICKNESS = 0.007; // rolled out (about 7 mm, like real cookie dough)
const BACK_Z = [ - 0.48, - 0.3 ]; // the back of the table, where the empty bowl is slid to
const STRETCH = 0.15; // rolling stretches it a bit more in the direction it's rolled

const ease = ( k ) => k * k * ( 3 - 2 * k );

let room = null;
let camera = null;
let controls = null;
let bowl = null;

let dough = null; // the dough on the table: a soft round slab, scaled to its current shape
let flour = null; // flour dusted on the table under it
const flourAmount = uniform( 0 );
let spot = null; // where on the table it's rolled out
const rollDir = new THREE.Vector3(); // away from the player (up on screen): the way the pin rolls
const sideDir = new THREE.Vector3(); // across: the way the pin lies

let pin = null; // the rolling pin (its handles are attached to it)
let pinHome = null;
let pinCenter = null; // the middle of the pin, in the pin's own coordinates
let pinRadius = 0.025;

let holding = false; // the pin is on the dough, ready to roll
let mouseDown = false;
let pressing = false; // rolling right now (mouse button held, or a hand in front of the camera)
let progress = 0; // 0 = a ball, 1 = rolled out thin
let along = 0; // where the pin is along the rolling direction (metres from the dough's middle)
let lastTarget = 0;
let spun = 0; // how far the pin has turned (it rolls without slipping)
let guideFrom = 0;
let stillFor = 0;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2( 2, 2 );
const tablePlane = new THREE.Plane( UP, - TABLE_TOP );
const hit = new THREE.Vector3();
const cameraButton = document.getElementById( 'camera-btn' );

// ---------- the dough and the flour ----------
// a soft slab: round from above, with a flattish top and bottom and rounded edges
// (a squashed "superellipse" turned around its axis). 1 wide, 1 tall, bottom at 0
function slabGeometry() {

	const points = [];
	const n = 3;
	for ( let i = 0; i <= 24; i ++ ) {

		const t = - Math.PI / 2 + Math.PI * i / 24;
		const c = Math.cos( t );
		const s = Math.sin( t );
		points.push( new THREE.Vector2( Math.abs( c ) ** ( 2 / n ), Math.sign( s ) * Math.abs( s ) ** ( 2 / n ) * 0.5 + 0.5 ) );

	}

	return new THREE.LatheGeometry( points, 64 );

}

function makeDough() {

	const material = new THREE.MeshStandardNodeMaterial( { roughness: 0.8 } );
	const mottle = mx_noise_float( positionWorld.mul( 60 ) ).mul( 0.5 ).add( 0.5 );
	material.colorNode = mix( color( 0xc8975a ), color( 0xebd2a2 ), mottle ).mul( mx_noise_float( positionWorld.mul( 300 ) ).mul( 0.06 ).add( 0.97 ) );
	const mesh = new THREE.Mesh( slabGeometry(), material );
	mesh.name = 'Rolled_Dough';
	mesh.castShadow = mesh.receiveShadow = true;
	mesh.visible = false;
	return mesh;

}

// a soft, uneven patch of flour: solid in the middle, speckled and fading towards the edge
function makeFlour() {

	const material = new THREE.MeshStandardNodeMaterial( { color: 0xf4f1ea, roughness: 1, transparent: true, depthWrite: false } );
	const r = uv().sub( 0.5 ).length().mul( 2 );
	const speckle = mx_noise_float( positionWorld.mul( 400 ) ).mul( 0.5 ).add( 0.5 );
	const edge = float( 1 ).sub( smoothstep( 0.45, 1, r.add( mx_noise_float( positionWorld.mul( 25 ) ).mul( 0.25 ) ) ) );
	material.opacityNode = edge.mul( speckle.mul( 0.45 ).add( 0.5 ) ).mul( flourAmount );
	const mesh = new THREE.Mesh( new THREE.CircleGeometry( 1, 48 ), material );
	mesh.rotation.x = - Math.PI / 2;
	mesh.receiveShadow = true;
	mesh.visible = false;
	return mesh;

}

function thickness( p ) {

	return THREE.MathUtils.lerp( BALL.thickness, SHEET_THICKNESS, ease( p ) );

}

// the dough's shape for a rolling progress p: thinner and wider (the amount of dough stays the same)
function shapeDough( p, squash = 0 ) {

	const h = thickness( p ) * ( 1 - squash );
	const r = BALL.radius * Math.sqrt( BALL.thickness / thickness( p ) ) * ( 1 + squash * 0.5 );
	const stretch = 1 + STRETCH * ease( p );
	dough.scale.set( r * stretch, h, r / stretch ); // local x is the rolling direction

}

// how far the dough reaches along the rolling direction right now
function doughReach() {

	return dough.scale.x;

}

// ---------- where it all happens ----------
// a free spot on the table for the dough AND the rolling pin lying across it: as far as possible
// from everything on the table (measured from each thing's edge), preferring the front
const PIN_HALF_LENGTH = 0.27; // half the pin's length, handles included
const SHEET_ROOM = 0.17; // how far the rolled-out sheet spreads

function distanceToSegment( p, a, b ) {

	const ab = b.clone().sub( a );
	const t = THREE.MathUtils.clamp( p.clone().sub( a ).dot( ab ) / ab.lengthSq(), 0, 1 );
	return Math.hypot( p.x - ( a.x + ab.x * t ), p.z - ( a.z + ab.z * t ) );

}

function findSpot() {

	// everything standing on the table, with how far it reaches from its middle
	const things = [];
	const add = ( box ) => {

		const c = box.getCenter( new THREE.Vector3() );
		const size = box.getSize( new THREE.Vector3() );
		if ( c.y > TABLE_TOP - 0.02 && c.y < TABLE_TOP + 0.3 ) things.push( { c, r: Math.max( size.x, size.z ) / 2 } );

	};
	room.traverse( ( o ) => {

		if ( o.isMesh && ! o.userData.baked && o.visible && o !== dough && o !== flour ) add( new THREE.Box3().setFromObject( o ) ); // (the pin too: it lies there until it's picked up)

	} );
	const mixer = room.parent?.getObjectByName( 'Hand_Mixer' );
	if ( mixer?.visible ) add( new THREE.Box3().setFromObject( mixer ) );

	let best = null;
	let bestScore = - Infinity;
	for ( let x = TABLE_X[ 0 ]; x <= TABLE_X[ 1 ]; x += 0.02 ) {

		for ( let z = TABLE_Z[ 0 ]; z <= TABLE_Z[ 1 ]; z += 0.02 ) {

			// room for the pin across the dough wherever it rolls to (from one edge of the sheet to
			// the other), and for the sheet around the middle
			let clearance = 1;
			for ( const s of [ - SHEET_ROOM, 0, SHEET_ROOM ] ) {

				const c = new THREE.Vector3( x, 0, z ).addScaledVector( rollDir, s );
				const a = c.clone().addScaledVector( sideDir, - PIN_HALF_LENGTH );
				const b = c.clone().addScaledVector( sideDir, PIN_HALF_LENGTH );
				for ( const t of things ) clearance = Math.min( clearance, distanceToSegment( t.c, a, b ) - t.r );

			}

			for ( const t of things ) clearance = Math.min( clearance, Math.hypot( t.c.x - x, t.c.z - z ) - t.r - SHEET_ROOM );
			const score = Math.min( clearance, 0.06 ) + z * 0.05; // enough room first, then closer to the player
			if ( score > bestScore ) {

				bestScore = score;
				best = new THREE.Vector3( x, TABLE_TOP, z );

			}

		}

	}

	return best;

}

// the empty bowl is slid to the back of the table, out of the way: the free spot there
// nearest to where it is now
function findBowlSpot() {

	const box = new THREE.Box3().setFromObject( bowl );
	const radius = box.getSize( new THREE.Vector3() ).x / 2;
	const now = box.getCenter( new THREE.Vector3() );
	const things = [];
	room.traverse( ( o ) => {

		if ( ! o.isMesh || o.userData.baked || ! o.visible || o === bowl || o === dough || o === flour ) return;
		const b = new THREE.Box3().setFromObject( o );
		const c = b.getCenter( new THREE.Vector3() );
		const size = b.getSize( new THREE.Vector3() );
		if ( c.y > TABLE_TOP - 0.02 && c.y < TABLE_TOP + 0.3 ) things.push( { c, r: Math.max( size.x, size.z ) / 2 } );

	} );
	const mixer = room.parent?.getObjectByName( 'Hand_Mixer' );
	if ( mixer?.visible ) {

		const b = new THREE.Box3().setFromObject( mixer );
		things.push( { c: b.getCenter( new THREE.Vector3() ), r: Math.max( b.getSize( new THREE.Vector3() ).x, b.getSize( new THREE.Vector3() ).z ) / 2 } );

	}

	let best = now;
	let bestScore = - Infinity;
	for ( let x = - 0.65; x <= 0.65; x += 0.02 ) {

		for ( let z = BACK_Z[ 0 ]; z <= BACK_Z[ 1 ]; z += 0.02 ) {

			const clearance = things.reduce( ( m, t ) => Math.min( m, Math.hypot( t.c.x - x, t.c.z - z ) - t.r - radius ), 1 );
			const score = Math.min( clearance, 0.03 ) - Math.hypot( x - now.x, z - now.z ) * 0.02;
			if ( score > bestScore ) {

				bestScore = score;
				best = new THREE.Vector3( x, 0, z );

			}

		}

	}

	return bowl.position.clone().add( new THREE.Vector3( best.x - now.x, 0, best.z - now.z ) );

}

function placeDough() {

	// roll away from the player: "up" on the screen; the pin lies across that
	camera.getWorldDirection( rollDir ).setY( 0 ).normalize();
	sideDir.crossVectors( rollDir, UP ).normalize();
	spot = findSpot();

	dough.position.copy( spot );
	dough.rotation.set( 0, Math.atan2( - rollDir.z, rollDir.x ), 0 );
	flour.position.set( spot.x, TABLE_TOP + 0.0015, spot.z ); // just above the table's invisible shadow catcher (kitchen.js)
	flour.scale.setScalar( SHEET_ROOM * 1.25 ); // dusted wide enough for the rolled-out sheet

}

// ---------- the rolling pin ----------
// lying across the dough, `s` metres along the rolling direction, its middle at `height`
function placePin( s, height ) {

	const align = new THREE.Quaternion().setFromUnitVectors( UP, sideDir ); // the pin's length (its y) across
	pin.quaternion.setFromAxisAngle( sideDir, spun ).multiply( align );
	const middle = spot.clone().addScaledVector( rollDir, s ).setY( height );
	pin.position.copy( middle ).sub( pinCenter.clone().multiply( pin.scale ).applyQuaternion( pin.quaternion ) );

}

function pinHeight() {

	return TABLE_TOP + thickness( progress ) + pinRadius;

}

// ---------- the steps ----------
async function takeOut() {

	setState( { busy: true } );

	// decide where things go: the bowl to the back, the dough where there's room then
	const bowlFrom = bowl.position.clone();
	const bowlTo = findBowlSpot();
	bowl.position.copy( bowlTo );
	room.updateMatrixWorld( true );
	placeDough();
	bowl.position.copy( bowlFrom );

	const { center, rimY } = bowlInfo();
	const from = new THREE.Vector3( center.x, rimY - 0.02, center.z );
	const lifted = from.clone().setY( rimY + 0.12 );
	emptyBowl();
	dough.visible = true;
	shapeDough( 0 );

	await runSequence( [
		{
			// the dough is lifted out of the bowl
			duration: 0.4,
			update: ( k ) => dough.position.lerpVectors( from, lifted, ease( k ) ),
		},
		{
			// the empty bowl is slid to the back of the table, out of the way
			duration: 0.5,
			update: ( k ) => bowl.position.lerpVectors( bowlFrom, bowlTo, ease( k ) ),
		},
		{
			// flour is dusted on the table while the dough is carried over
			duration: 0.6,
			start: () => { flour.visible = true; },
			update: ( k ) => {

				flourAmount.value = ease( k );
				dough.position.lerpVectors( lifted, spot, ease( k ) );
				dough.position.y += Math.sin( Math.PI * k ) * 0.06;

			},
		},
		{
			// it lands with a soft squash
			duration: 0.35,
			update: ( k ) => shapeDough( 0, Math.sin( Math.PI * k ) * 0.25 ),
			end: () => shapeDough( 0 ),
		},
	] );

	setState( { busy: false, doughOut: true } );

}

async function grab() {

	setState( { rolling: true } );
	controls.enabled = false; // dragging now rolls instead of turning the camera
	along = lastTarget = - doughReach() * 0.6;

	const fromP = pin.position.clone();
	const fromQ = pin.quaternion.clone();
	placePin( along, pinHeight() + 0.01 );
	const toP = pin.position.clone();
	const toQ = pin.quaternion.clone();

	await runSequence( [ {
		duration: 0.6,
		update: ( k ) => {

			pin.position.lerpVectors( fromP, toP, ease( k ) );
			pin.position.y += Math.sin( Math.PI * k ) * 0.08;
			pin.quaternion.slerpQuaternions( fromQ, toQ, ease( k ) );

		},
	} ] );

	holding = true;
	cameraButton.textContent = 'Roll with your hand (C)';
	cameraButton.classList.add( 'show' );
	if ( getState().prefersCamera ) await toggleCamera(); // they mixed with their hand: keep using it
	showTutorial();
	showStatus( `Rolling out the dough · ${ Math.round( progress * 100 ) }%` );

}

async function putDown( done = false ) {

	holding = false;
	pressing = mouseDown = false;
	cameraButton.classList.remove( 'show' );
	stopHandTracking();
	hideGuide();

	const fromP = pin.position.clone();
	const fromQ = pin.quaternion.clone();
	await runSequence( [ {
		duration: 0.6,
		update: ( k ) => {

			pin.position.lerpVectors( fromP, pinHome.position, ease( k ) );
			pin.position.y += Math.sin( Math.PI * k ) * 0.08;
			pin.quaternion.slerpQuaternions( fromQ, pinHome.quaternion, ease( k ) );

		},
	} ] );

	controls.enabled = true;
	setState( done ? { rolling: false, rolled: true } : { rolling: false } );

}

async function toggleCamera() {

	if ( ! holding ) return;

	if ( isTracking() ) {

		stopHandTracking();
		cameraButton.textContent = 'Roll with your hand (C)';
		setState( { prefersCamera: false } );
		showTutorial();
		return;

	}

	cameraButton.textContent = 'Starting the camera…';
	try {

		await startHandTracking();
		if ( ! holding ) return stopHandTracking();
		cameraButton.textContent = 'Use the mouse instead (C)';
		setState( { prefersCamera: true } );

	} catch {

		cameraButton.textContent = 'No camera · use the mouse';

	}

	showTutorial();

}

function showTutorial() {

	const withHand = isTracking();
	showGuide( {
		icon: withHand ? '✋' : '🖱️',
		text: withHand ? 'Move your hand forward and back to roll the pin' : 'Hold the mouse button and move up and down to roll',
		small: withHand ? 'Like rolling a real pin: holding still won\'t flatten it' : 'Roll over the dough again and again until it\'s thin',
		motion: 'line',
	} );
	guideFrom = progress;
	stillFor = 0;

}

// ---------- hooks for interaction.js ----------
function rayHits( ray, object ) {

	return object && object.visible && ray.intersectObject( object, true ).length > 0;

}

// the hover hint: { text, clickable }, false to show nothing, null if it's not about this step
export function rollingHint( ray ) {

	if ( ! pin ) return null;
	const { mixed, doughOut, rolled, rolling, busy } = getState();

	if ( holding ) {

		if ( guideShown() ) return false; // the tutorial already says it
		if ( isTracking() ) return { text: handPosition() ? 'keep moving your hand forward and back' : 'show your hand to the camera · Esc to put the pin down', clickable: false };
		return { text: pressing ? 'keep rolling forward and back' : 'hold the mouse button and move up and down · C to use your hand · Esc to put it down', clickable: false };

	}

	if ( rolling ) return false; // the pin is on its way
	if ( ! mixed ) return null;

	if ( ! doughOut ) return rayHits( ray, bowl ) ? { text: 'Dough · take it out of the bowl', clickable: ! busy } : null;
	if ( rayHits( ray, bowl ) && ! rayHits( ray, dough ) ) return { text: 'Mixing Bowl · empty', clickable: false };
	if ( rayHits( ray, pin ) ) return rolled ? { text: 'Rolling Pin · the dough is rolled out', clickable: false } : { text: 'Rolling Pin · pick up and roll out the dough', clickable: ! busy };
	if ( rayHits( ray, dough ) ) return rolled ? { text: 'Dough · rolled out and ready', clickable: false } : { text: 'Dough · roll it out with the rolling pin', clickable: false };
	return null;

}

// a click: take the dough out, or pick up the rolling pin
export function tryRollingClick( ray ) {

	if ( ! pin ) return false;
	const { mixed, doughOut, rolled, rolling, mixing, busy } = getState();
	if ( ! mixed || rolling || mixing || busy ) return false;

	if ( ! doughOut && rayHits( ray, bowl ) ) {

		takeOut();
		return true;

	}

	if ( doughOut && ! rolled && rayHits( ray, pin ) ) {

		grab();
		return true;

	}

	return false;

}

// ---------- setup and every frame ----------
export function initRolling( { scene, room: kitchen, camera: cam, controls: orbit, canvas } ) {

	room = kitchen;
	camera = cam;
	controls = orbit;
	bowl = room.getObjectByName( 'Mixing_Bowl' );

	// the pin's handles are attached to one of them in Blender: that one carries the whole pin
	const body = room.getObjectByName( 'Rolling_Pin' );
	if ( ! body ) return;
	pin = body;
	while ( pin.parent && pin.parent !== room ) pin = pin.parent;
	pinHome = { position: pin.position.clone(), quaternion: pin.quaternion.clone() };
	pin.updateMatrixWorld( true );
	pinCenter = pin.worldToLocal( new THREE.Box3().setFromObject( body ).getCenter( new THREE.Vector3() ) );
	body.geometry.computeBoundingBox();
	const size = body.geometry.boundingBox.getSize( new THREE.Vector3() );
	pinRadius = Math.min( size.x, size.z ) / 2 * body.getWorldScale( new THREE.Vector3() ).x;

	dough = makeDough();
	flour = makeFlour();
	room.add( flour, dough );

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

	// taken out (and maybe rolled) before a page refresh: put it back on the table like it was
	const saved = loadDoughProgress();
	if ( getState().mixed && saved.doughOut ) {

		bowl.position.copy( findBowlSpot() );
		room.updateMatrixWorld( true );
		placeDough();
		emptyBowl();
		progress = saved.rolled ? 1 : 0;
		shapeDough( progress );
		flourAmount.value = 1;
		dough.visible = flour.visible = true;
		setState( { doughOut: true, rolled: saved.rolled } );

	}

}

export function updateRolling( dt ) {

	if ( ! holding ) return;

	// where the hand or the mouse wants the pin: forward/back along the rolling direction
	updateHandTracking();
	const hand = isTracking() ? handPosition() : null;
	const reach = doughReach() + 0.04;
	let target = lastTarget;

	if ( hand ) target = THREE.MathUtils.clamp( ( 0.5 - hand.y ) / 0.25, - 1, 1 ) * reach; // hand up = away from you
	else if ( ! isTracking() ) {

		raycaster.setFromCamera( pointer, camera );
		if ( raycaster.ray.intersectPlane( tablePlane, hit ) ) target = THREE.MathUtils.clamp( hit.sub( spot ).dot( rollDir ), - reach, reach );

	}

	pressing = mouseDown || hand !== null;
	const moving = dt > 0 && Math.abs( target - lastTarget ) / dt > 0.03; // the mouse/hand itself, not the gliding pin
	lastTarget = target;

	// the pin follows, rolling over the dough as it goes
	const before = along;
	along += ( target - along ) * ( 1 - Math.exp( - dt * 12 ) );
	const moved = along - before;
	spun += moved / pinRadius;

	// only rolling over the dough thins it: pressing, moving, and on the dough
	const onDough = Math.abs( along ) < doughReach();
	const gained = pressing && moving && onDough ? Math.abs( moved ) / ROLL_DISTANCE : 0;
	progress = Math.min( 1, progress + gained );

	shapeDough( progress );
	placePin( along, pinHeight() + ( pressing ? 0 : 0.008 ) ); // lifts a little when you let go

	// the tutorial fades out once you've got the hang of it, and comes back if you stop
	stillFor = gained > 0 ? 0 : stillFor + dt;
	if ( progress - guideFrom > 0.12 ) hideGuide();
	if ( stillFor > 3 && ! guideShown() ) showTutorial();

	showStatus( `Rolling out the dough · ${ Math.round( progress * 100 ) }%` );
	if ( progress >= 1 ) putDown( true );

}
