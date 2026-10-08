// the rolling step: once the dough is mixed, click the bowl to take it out. The empty bowl slides
// out of the way, flour is dusted on the table and the dough lands on it. Then pick up the rolling
// pin and roll it forward and back over the dough (hold the mouse button and move up and down, or
// move your hand forward and back in front of the camera) until it's a thin sheet. Only actually
// rolling over the dough thins it. Esc puts the pin down.
//   dough.js  the dough and the flour    pin.js  the rolling pin
//   placement.js  where the bowl and the dough go on the table
import * as THREE from 'three/webgpu';
import { ROLL_DISTANCE } from '../config.js';
import { getState, setState } from '../state.js';
import { showStatus } from '../ui.js';
import { runSequence, ease } from '../sequence.js';
import { loadDoughProgress } from '../progress.js';
import { TABLE_TOP } from '../table.js';
import { bowlInfo, emptyBowl } from '../bowl/index.js';
import { HeldTool } from '../heldTool.js';
import { makeDough, makeFlour, flourAmount, thickness, shapeDough, doughReach } from './dough.js';
import { findPin, placePin } from './pin.js';
import { findBowlSpot, findDoughSpot, SHEET_ROOM } from './placement.js';

const UP = new THREE.Vector3( 0, 1, 0 );

let room = null;
let camera = null;
let bowl = null;
let tool = null; // mouse / hand / camera button / tutorial (see heldTool.js)

let dough = null; // the dough on the table (see dough.js)
let flour = null; // flour dusted on the table under it
let pin = null; // { root, home, center, radius } (see pin.js)
let spot = null; // where on the table it's rolled out
const rollDir = new THREE.Vector3(); // away from the player (up on screen): the way the pin rolls
const sideDir = new THREE.Vector3(); // across: the way the pin lies

let pressing = false; // rolling right now (mouse button held, or a hand in front of the camera)
let progress = 0; // 0 = a ball, 1 = rolled out thin
let along = 0; // where the pin is along the rolling direction (metres from the dough's middle)
let lastTarget = 0;
let spun = 0; // how far the pin has turned

const tablePlane = new THREE.Plane( UP, - TABLE_TOP );
const hit = new THREE.Vector3();

// ---------- placing things ----------
// the dough goes where it and the pin have room, with the bowl already at `bowlAt`
function placeDough( bowlAt ) {

	// roll away from the player: "up" on the screen; the pin lies across that
	camera.getWorldDirection( rollDir ).setY( 0 ).normalize();
	sideDir.crossVectors( rollDir, UP ).normalize();

	const bowlNow = bowl.position.clone();
	bowl.position.copy( bowlAt ); // (find the spot as if the bowl were already moved)
	room.updateMatrixWorld( true );
	spot = findDoughSpot( room, rollDir, sideDir, [ dough, flour ] );
	bowl.position.copy( bowlNow );

	dough.position.copy( spot );
	dough.rotation.set( 0, Math.atan2( - rollDir.z, rollDir.x ), 0 ); // its local x along the rolling direction
	flour.position.set( spot.x, TABLE_TOP + 0.0015, spot.z ); // just above the table's invisible shadow catcher (kitchen.js)
	flour.scale.setScalar( SHEET_ROOM * 1.25 ); // dusted wide enough for the rolled-out sheet

}

function pinHeight() {

	return TABLE_TOP + thickness( progress ) + pin.radius;

}

function layPin( height ) {

	placePin( pin, { spot, rollDir, sideDir, along, height, spun } );

}

// fly the pin from where it is to a pose, along a small arc
function movePin( position, quaternion ) {

	const { root } = pin;
	const fromP = root.position.clone();
	const fromQ = root.quaternion.clone();
	return runSequence( [ {
		duration: 0.6,
		update: ( k ) => {

			root.position.lerpVectors( fromP, position, ease( k ) );
			root.position.y += Math.sin( Math.PI * k ) * 0.08;
			root.quaternion.slerpQuaternions( fromQ, quaternion, ease( k ) );

		},
	} ] );

}

// ---------- the steps ----------
async function takeOut() {

	setState( { busy: true } );

	// where things go: the bowl to the back, the dough where there's room then
	const bowlFrom = bowl.position.clone();
	const bowlTo = findBowlSpot( room, bowl, [ dough, flour ] );
	placeDough( bowlTo );

	const { center, rimY } = bowlInfo();
	const from = new THREE.Vector3( center.x, rimY - 0.02, center.z );
	const lifted = from.clone().setY( rimY + 0.12 );
	emptyBowl();
	dough.visible = true;
	shapeDough( dough, 0 );

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
			update: ( k ) => shapeDough( dough, 0, Math.sin( Math.PI * k ) * 0.25 ),
			end: () => shapeDough( dough, 0 ),
		},
	] );

	setState( { busy: false, doughOut: true } );

}

async function grab() {

	setState( { rolling: true } );
	tool.lockView();
	along = lastTarget = - doughReach( dough ) * 0.6;

	// where it goes: across the dough, a little way back from the middle
	const { root } = pin;
	const fromP = root.position.clone();
	const fromQ = root.quaternion.clone();
	layPin( pinHeight() + 0.01 );
	const toP = root.position.clone();
	const toQ = root.quaternion.clone();
	root.position.copy( fromP );
	root.quaternion.copy( fromQ );
	await movePin( toP, toQ );

	await tool.begin(); // (uses the camera if they mixed with their hand)
	showStatus( `Rolling out the dough · ${ Math.round( progress * 100 ) }%` );

}

async function putDown( done = false ) {

	tool.end();
	pressing = false;
	await movePin( pin.home.position, pin.home.quaternion );
	tool.unlockView();
	setState( done ? { rolling: false, rolled: true } : { rolling: false } );

}

// ---------- hooks for interaction.js ----------
function rayHits( ray, object ) {

	return object && object.visible && ray.intersectObject( object, true ).length > 0;

}

// the hover hint: { text, clickable }, false to show nothing, null if it's not about this step
export function rollingHint( ray ) {

	if ( ! pin ) return null;
	const { mixed, doughOut, rolled, rolling, busy } = getState();

	if ( tool.holding ) return tool.hint( pressing );
	if ( rolling ) return false; // the pin is on its way
	if ( ! mixed ) return null;

	if ( ! doughOut ) return rayHits( ray, bowl ) ? { text: 'Dough · take it out of the bowl', clickable: ! busy } : null;
	if ( rayHits( ray, bowl ) && ! rayHits( ray, dough ) ) return { text: 'Mixing Bowl · empty', clickable: false };
	if ( rayHits( ray, pin.root ) ) return rolled ? { text: 'Rolling Pin · the dough is rolled out', clickable: false } : { text: 'Rolling Pin · pick up and roll out the dough', clickable: ! busy };
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

	if ( doughOut && ! rolled && rayHits( ray, pin.root ) ) {

		grab();
		return true;

	}

	return false;

}

// the dough on the table (for cutting cookies out of it)
export function rolledDough() {

	return dough;

}

// ---------- setup and every frame ----------
export function initRolling( { room: kitchen, camera: cam, controls, canvas } ) {

	room = kitchen;
	camera = cam;
	bowl = room.getObjectByName( 'Mixing_Bowl' );
	pin = findPin( room );
	if ( ! pin ) return;

	dough = makeDough();
	flour = makeFlour();
	room.add( flour, dough );

	tool = new HeldTool( {
		camera,
		controls,
		canvas,
		verb: 'Roll',
		guide: {
			motion: 'line',
			hand: { text: 'Move your hand forward and back to roll the pin', small: 'Like rolling a real pin: holding still won\'t flatten it' },
			mouse: { text: 'Hold the mouse button and move up and down to roll', small: 'Roll over the dough again and again until it\'s thin' },
		},
		hints: {
			handMoving: 'keep moving your hand forward and back',
			handMissing: 'show your hand to the camera · Esc to put the pin down',
			mouseOn: 'keep rolling forward and back',
			mouseOff: 'hold the mouse button and move up and down · C to use your hand · Esc to put it down',
		},
		progress: () => progress,
		onEscape: () => putDown(),
	} );

	// taken out (and maybe rolled) before a page refresh: put it back on the table like it was
	const saved = loadDoughProgress();
	if ( getState().mixed && saved.doughOut ) {

		const bowlTo = findBowlSpot( room, bowl, [ dough, flour ] );
		placeDough( bowlTo );
		bowl.position.copy( bowlTo );
		emptyBowl();
		progress = saved.rolled ? 1 : 0;
		shapeDough( dough, progress );
		flourAmount.value = 1;
		dough.visible = flour.visible = true;
		setState( { doughOut: true, rolled: saved.rolled } );

	}

}

export function updateRolling( dt ) {

	if ( ! tool?.holding ) return;

	// where the hand or the mouse wants the pin: forward/back along the rolling direction
	const hand = tool.hand();
	const reach = doughReach( dough ) + 0.04;
	let target = lastTarget;

	if ( hand ) target = THREE.MathUtils.clamp( ( 0.5 - hand.y ) / 0.25, - 1, 1 ) * reach; // hand up = away from you
	else if ( ! tool.usingCamera() && tool.pointerOn( tablePlane, hit ) ) target = THREE.MathUtils.clamp( hit.sub( spot ).dot( rollDir ), - reach, reach );

	pressing = tool.mouseDown || hand !== null;
	const moving = dt > 0 && Math.abs( target - lastTarget ) / dt > 0.03; // the mouse/hand itself, not the gliding pin
	lastTarget = target;

	// the pin follows, rolling over the dough as it goes
	const before = along;
	along += ( target - along ) * ( 1 - Math.exp( - dt * 12 ) );
	const moved = along - before;
	spun += moved / pin.radius;

	// only rolling over the dough thins it: pressing, moving, and on the dough
	const onDough = Math.abs( along ) < doughReach( dough );
	const gained = pressing && moving && onDough ? Math.abs( moved ) / ROLL_DISTANCE : 0;
	progress = Math.min( 1, progress + gained );
	tool.updateGuide( gained, dt );

	shapeDough( dough, progress );
	layPin( pinHeight() + ( pressing ? 0 : 0.008 ) ); // lifts a little when you let go

	showStatus( `Rolling out the dough · ${ Math.round( progress * 100 ) }%` );
	if ( progress >= 1 ) putDown( true );

}
