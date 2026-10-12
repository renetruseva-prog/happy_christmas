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

// On a sharp (retina) screen 2x pixels is 4x the work for the same picture, with the glow and
// the soft shadows on top, so it draws at most 1.5x, and without the extra edge smoothing there
// (the extra pixels do that job). It also lowers the resolution by itself if the frame rate drops
// (see adaptResolution below)
const MAX_RATIO = Math.min( window.devicePixelRatio, 1.5 );
const MIN_RATIO = 0.6;
export const renderer = new THREE.WebGPURenderer( { antialias: window.devicePixelRatio < 1.5 } );
renderer.setPixelRatio( MAX_RATIO );
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
const scenePassColor = pass( scene, camera ).getTextureNode( 'output' );
// (threshold 2: only things that give off light glow; lower and the lit white bowl glows too,
// which washes out the colours of everything in it)
renderPipeline.outputNode = scenePassColor.add( bloom( scenePassColor, 0.35, 0.3, 2 ) );

addExtraLights( scene );

window.addEventListener( 'resize', () => {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );

} );

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

// every frame, with the real time since the last one: if frames take too long for a while, draw
// with fewer pixels; if they're quick, creep back up. (Only whole stretches of frames count, and
// not when the page was in the background.)
let ratio = MAX_RATIO;
let timeSum = 0;
let frames = 0;
let settleFor = 0; // seconds before it may go back up after a change

export function adaptResolution( realDt ) {

	if ( realDt > 0.25 || document.visibilityState !== 'visible' ) return;

	timeSum += realDt;
	frames ++;
	settleFor -= realDt;
	if ( frames < 45 ) return;

	const average = timeSum / frames;
	timeSum = 0;
	frames = 0;

	let next = ratio;
	if ( average > 0.024 ) next = Math.max( MIN_RATIO, ratio * 0.85 ); // slower than about 42 fps
	else if ( average < 0.0145 && settleFor <= 0 ) next = Math.min( MAX_RATIO, ratio * 1.1 ); // faster than about 69 fps
	if ( Math.abs( next - ratio ) < 0.01 ) return;

	ratio = next;
	settleFor = 6;
	renderer.setPixelRatio( ratio );

}

export function render() {

	renderPipeline.render();

}
