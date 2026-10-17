// the renderer, camera, controls and the glow post-processing
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MAX_DISTANCE, ROOM_MIN, ROOM_MAX } from './config.js';
import { addExtraLights } from './lights.js';
import { keepCameraOut } from './solids.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x0d0a08 );

export const camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.05, 100 );
camera.position.set( - 0.9, 1.75, 1.85 );

// How sharp the picture is drawn. A sharp (retina) screen has 2x pixels, which is 4x the work for
// the same picture, so it's capped by how many pixels in all it draws (about 3 million: 1.5x on a
// laptop screen), not by a fixed ratio. That way zooming the page in or out (which changes the
// ratio and the window size together) keeps the picture just as sharp, and it's worked out again
// whenever the window changes. It's never below 1x on a normal screen, and drops by itself if the
// frame rate does (see adaptResolution below)
const PIXEL_BUDGET = 3e6;
let quality = 1; // 1 full .. MIN_QUALITY, lowered while frames are slow
const MIN_QUALITY = 0.4; // (the floor in pixelRatio() is what really stops it)

function sharpRatio() {

	return Math.min( window.devicePixelRatio, Math.max( 1, Math.sqrt( PIXEL_BUDGET / ( window.innerWidth * window.innerHeight ) ) ) );

}

// never below 1 pixel per page pixel (or the screen's own, if it's lower), however slow the frames
const MIN_RATIO = 1;

function pixelRatio() {

	const sharp = sharpRatio();
	return Math.max( Math.min( sharp, MIN_RATIO ), sharp * quality );

}

export const renderer = new THREE.WebGPURenderer( { antialias: window.devicePixelRatio < 1.5 } );
renderer.setPixelRatio( pixelRatio() );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild( renderer.domElement );

export const controls = new OrbitControls( camera, renderer.domElement );
controls.target.set( 0.15, 0.85, - 0.6 ); // the ingredients table
controls.enableDamping = true;
controls.minDistance = 0.3;
controls.maxDistance = MAX_DISTANCE;
controls.update();

// glow on the christmas lights, candles and oven
const renderPipeline = new THREE.RenderPipeline( renderer );
const scenePass = pass( scene, camera );
const scenePassColor = scenePass.getTextureNode( 'output' );
// (threshold 2: only things that give off light glow; lower and the lit white bowl glows too,
// which washes out the colours of everything in it)
renderPipeline.outputNode = scenePassColor.add( bloom( scenePassColor, 0.35, 0.3, 2 ) );

addExtraLights( scene );

window.addEventListener( 'resize', () => {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setPixelRatio( pixelRatio() ); // (zooming the page changes the window size and the ratio)
	renderer.setSize( window.innerWidth, window.innerHeight );

} );

// Pinching or Ctrl-scrolling would zoom the whole page (blowing up the picture and the panels)
// whenever the game doesn't take the gesture itself, as when a cutter is held. The game zooms
// the view with them instead (or ignores them), and the page stays put.
window.addEventListener( 'wheel', ( e ) => { if ( e.ctrlKey ) e.preventDefault(); }, { passive: false } );
for ( const type of [ 'gesturestart', 'gesturechange', 'gestureend' ] ) window.addEventListener( type, ( e ) => e.preventDefault() ); // (Safari)

// ---------- keep the camera inside the kitchen ----------
const roomBounds = new THREE.Box3( new THREE.Vector3( ...ROOM_MIN ), new THREE.Vector3( ...ROOM_MAX ) );
const viewDir = new THREE.Vector3();

function distanceToWall( origin, dir ) {

	// how far a ray from inside the box travels before leaving it (per axis "slab" test)
	let t = Infinity;
	for ( const axis of [ 'x', 'y', 'z' ] ) {

		if ( dir[ axis ] > 1e-6 ) t = Math.min( t, ( roomBounds.max[ axis ] - origin[ axis ] ) / dir[ axis ] );
		else if ( dir[ axis ] < - 1e-6 ) t = Math.min( t, ( roomBounds.min[ axis ] - origin[ axis ] ) / dir[ axis ] );

	}

	return t;

}

export function constrainCamera() {

	// panning (right-drag) moves the target: keep it inside the room too
	roomBounds.clampPoint( controls.target, controls.target );

	// zooming/orbiting out stops where the camera would hit a wall
	viewDir.subVectors( camera.position, controls.target ).normalize();
	controls.maxDistance = Math.max( controls.minDistance, Math.min( MAX_DISTANCE, distanceToWall( controls.target, viewDir ) ) );

	// and it can't go under the table, into the counters or the tree, or through the floor
	keepCameraOut( camera );

}

// every frame, with the real time since the last one: if frames stay too slow for a while, draw
// with fewer pixels, and creep back up once they're as quick as the screen allows. "As quick as the
// screen allows" is learned (the quickest stretch seen: about 16.7 ms on a 60 Hz screen), because a
// fixed target would never be reached on a screen that can't go that fast, and the picture would
// stay low-res for good. It never goes below normal sharpness (1 pixel per page pixel). Only whole
// stretches of frames count, and not when the page was in the background.
let timeSum = 0;
let frames = 0;
let settleFor = 0; // seconds before it may go back up after a change
let slowStretches = 0; // slow stretches in a row
let refresh = 1 / 60; // the quickest a frame has been

export function adaptResolution( realDt ) {

	if ( realDt > 0.25 || document.visibilityState !== 'visible' ) return;

	timeSum += realDt;
	frames ++;
	settleFor -= realDt;
	if ( frames < 45 ) return;

	const average = timeSum / frames;
	timeSum = 0;
	frames = 0;
	if ( average > 0.005 ) refresh = Math.min( refresh, average );

	const slow = average > Math.max( 0.026, refresh * 1.7 ); // below about 38 fps
	const quick = average < refresh * 1.15; // as fast as the screen goes
	slowStretches = slow ? slowStretches + 1 : 0;

	let next = quality;
	if ( slowStretches >= 2 && pixelRatio() > MIN_RATIO + 0.01 ) {

		next = Math.max( MIN_QUALITY, Math.min( 1, MIN_RATIO / sharpRatio() ), quality * 0.9 ); // (not below where the floor takes over)
		slowStretches = 0;

	} else if ( quick && settleFor <= 0 && quality < 1 ) next = Math.min( 1, quality * 1.12 );

	if ( Math.abs( next - quality ) < 0.005 ) return;

	quality = next;
	settleFor = 4;
	renderer.setPixelRatio( pixelRatio() );

}

// Getting ready for what hasn't been seen yet. The GPU works out how to draw each kind of thing the
// first time it's drawn, and that can freeze the game for a second right in the middle of an
// animation (the flour pouring out, the dough, the smoke...). So it's all done at the start,
// while the welcome card is up: everything that's hidden for now is made visible for the moment
// it takes to hand it over to be worked out, then hidden again.
export async function warmUp() {

	await renderer.init();

	const hidden = []; // [ object, how it was ]
	const empty = []; // instanced things with nothing in them yet: they'd be skipped
	scene.traverse( ( o ) => {

		if ( ! ( o.isMesh || o.isSprite || o.isPoints || o.isLine ) ) return;
		if ( o.visible === false || o.isInstancedMesh && o.count === 0 ) hidden.push( [ o, o.visible, o.frustumCulled ] );
		if ( o.isInstancedMesh && o.count === 0 ) empty.push( o );

	} );

	for ( const [ o ] of hidden ) {

		o.visible = true;
		o.frustumCulled = false;

	}

	for ( const o of empty ) o.count = 1;

	// (what's to be drawn is picked out right away, before the first wait: so it can all be put back at once)
	const compiling = scenePass.compileAsync( renderer );
	for ( const [ o, visible, culled ] of hidden ) {

		o.visible = visible;
		o.frustumCulled = culled;

	}

	for ( const o of empty ) o.count = 0;
	await compiling;

}

export function render() {

	renderPipeline.render();

}
