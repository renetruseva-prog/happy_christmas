import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Blender's glTF exporter multiplies light watts by 683 (lm/W); undo that so the
// lights match the Blender render.
const LIGHT_SCALE = 0.4 / 683;

// the baked lighting texture is saved at half brightness (see the bake step in Blender)
const BAKE_BOOST = 2;

const scene = new THREE.Scene();
scene.background = new THREE.Color( 0x0d0a08 );

const camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.05, 100 );
camera.position.set( - 0.9, 1.75, 1.85 );

const renderer = new THREE.WebGPURenderer( { antialias: true } );
renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

const controls = new OrbitControls( camera, renderer.domElement );
controls.target.set( 0.15, 0.85, - 0.6 ); // the ingredients table
controls.enableDamping = true;
controls.minDistance = 0.3;
controls.maxDistance = 4;
controls.update();

// ---------- keep the camera inside the kitchen ----------
// the room's inside (walls at x ±2.5, z ±2, floor 0, ceiling 2.7) minus a margin,
// so the camera never reaches a wall, the window, the ceiling beams or the floor
const MAX_DISTANCE = 4;
const roomBounds = new THREE.Box3(
	new THREE.Vector3( - 2.35, 0.15, - 1.85 ),
	new THREE.Vector3( 2.35, 2.45, 1.85 ),
);
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

function constrainCamera() {

	// panning (right-drag) moves the target: keep it inside the room too
	roomBounds.clampPoint( controls.target, controls.target );

	// zooming/orbiting out stops where the camera would hit a wall
	viewDir.subVectors( camera.position, controls.target ).normalize();
	controls.maxDistance = Math.max( controls.minDistance, Math.min( MAX_DISTANCE, distanceToWall( controls.target, viewDir ) ) );

}

// glow on the christmas lights, candles and oven
const renderPipeline = new THREE.RenderPipeline( renderer );
const scenePass = pass( scene, camera );
const scenePassColor = scenePass.getTextureNode( 'output' );
renderPipeline.outputNode = scenePassColor.add( bloom( scenePassColor, 0.35, 0.3, 0.9 ) );

// lights that glTF can't carry over from Blender (area lights)
scene.add( new THREE.HemisphereLight( 0xffd2a0, 0x2a1a10, 0.15 ) );

const windowLight = new THREE.SpotLight( 0x7393ff, 6, 6, Math.PI / 3, 0.8 );
windowLight.position.set( - 1, 1.65, - 2.4 );
windowLight.target.position.set( - 0.6, 0.6, 0 );
scene.add( windowLight, windowLight.target );

// ---------- load the kitchen ----------
const interactables = [];
const flickerLights = [];
const twinkleLights = [];
const twinkleBulbs = [];

new GLTFLoader().load( '/models/kitchen.glb', ( gltf ) => {

	const room = gltf.scene;

	room.traverse( ( obj ) => {

		if ( obj.isMesh && obj.name.startsWith( 'XLights_Bulbs' ) ) {

			// each colour of bulb gets its own material so it can twinkle on its own
			obj.material = obj.material.clone();
			twinkleBulbs.push( { material: obj.material, base: obj.material.emissiveIntensity ?? 1, seed: Math.random() * 100 } );

		}

		if ( obj.isMesh && obj.userData.baked ) {

			// lighting is already in the baked texture: show it unlit.
			// The bake was stored at half brightness to keep highlights, so double it back.
			obj.material = new THREE.MeshBasicNodeMaterial( {
				map: obj.material.map,
				color: new THREE.Color( BAKE_BOOST, BAKE_BOOST, BAKE_BOOST ),
			} );

		} else if ( obj.isMesh ) {

			// objects that move (props, oven door) stay lit in real time
			obj.castShadow = true;
			obj.receiveShadow = true;

		}

		if ( obj.isLight ) {

			obj.intensity *= LIGHT_SCALE;
			if ( obj.name.startsWith( 'Light_Pendant' ) && obj.isSpotLight ) {

				obj.castShadow = true;
				obj.shadow.mapSize.set( 2048, 2048 );
				obj.shadow.bias = - 0.0005;

			}

			if ( obj.name.startsWith( 'Light_XLights' ) || obj.name === 'Light_Tree_Glow' ) twinkleLights.push( { light: obj, base: obj.intensity, seed: Math.random() * 100 } );

			if ( obj.name.startsWith( 'Candle' ) ) flickerLights.push( { light: obj, base: obj.intensity, seed: Math.random() * 100 } );

		}

		if ( obj.userData.interactable ) interactables.push( obj );

	} );

	// start from the camera that was set up in Blender
	const blenderCam = gltf.cameras[ 0 ];
	if ( blenderCam ) {

		blenderCam.updateWorldMatrix( true, false );
		blenderCam.getWorldPosition( camera.position );
		camera.fov = blenderCam.fov;
		camera.updateProjectionMatrix();
		controls.update();

	}

	scene.add( room );

	// baked surfaces can't receive live shadows, so an invisible plane on the
	// table catches the shadows of the props that sit (and move) on it
	const tableShadow = new THREE.Mesh( new THREE.PlaneGeometry( 1.7, 0.95 ), new THREE.ShadowNodeMaterial( { opacity: 0.5 } ) );
	tableShadow.rotation.x = - Math.PI / 2;
	tableShadow.position.set( 0, 0.781, - 0.15 );
	tableShadow.receiveShadow = true;
	scene.add( tableShadow );

} );

// ---------- hover interactables ----------
const hint = document.getElementById( 'hint' );
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2( 2, 2 );

window.addEventListener( 'pointermove', ( e ) => {

	pointer.set( ( e.clientX / window.innerWidth ) * 2 - 1, - ( e.clientY / window.innerHeight ) * 2 + 1 );

} );

function findInteractable( obj ) {

	while ( obj ) {

		if ( obj.userData.interactable ) return obj;
		obj = obj.parent;

	}

	return null;

}

function updateHover() {

	raycaster.setFromCamera( pointer, camera );
	const hit = raycaster.intersectObjects( interactables, true )[ 0 ];
	const target = hit ? findInteractable( hit.object ) : null;

	if ( target ) {

		hint.textContent = `${ target.name.replaceAll( '_', ' ' ) } · ${ target.userData.action.replaceAll( '_', ' ' ) }`;
		hint.style.opacity = 1;
		document.body.style.cursor = 'pointer';

	} else {

		hint.style.opacity = 0;
		document.body.style.cursor = '';

	}

}

window.addEventListener( 'resize', () => {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );

} );

function animate( time ) {

	const t = time / 1000;
	for ( const f of flickerLights ) {

		f.light.intensity = f.base * ( 0.85 + 0.15 * Math.sin( t * 9 + f.seed ) * Math.sin( t * 3.7 + f.seed * 2 ) );

	}

	constrainCamera();
	// christmas lights: slow, soft pulse (each light/bulb is offset by its seed)
	for ( const f of twinkleLights ) f.light.intensity = f.base * ( 0.7 + 0.3 * Math.sin( t * 2.2 + f.seed ) );
	for ( const b of twinkleBulbs ) b.material.emissiveIntensity = b.base * ( 0.6 + 0.4 * Math.sin( t * 2.2 + b.seed ) );

	controls.update();
	updateHover();
	renderPipeline.render();

}
