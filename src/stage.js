// the renderer, camera, controls and the glow post-processing
import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MAX_DISTANCE, ROOM_MIN, ROOM_MAX } from './config.js';
import { addExtraLights } from './lights.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x0d0a08 );

export const camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.05, 100 );
camera.position.set( - 0.9, 1.75, 1.85 );

export const renderer = new THREE.WebGPURenderer( { antialias: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
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

}

export function render() {

	renderPipeline.render();

}
