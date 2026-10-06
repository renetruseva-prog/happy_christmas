import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Blender's glTF exporter multiplies light watts by 683 (lm/W); undo that so the
// lights match the Blender render.
const LIGHT_SCALE = 0.4 / 683;

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
controls.maxDistance = 4;
controls.update();

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

new GLTFLoader().load( '/models/kitchen.glb', ( gltf ) => {

	const room = gltf.scene;

	room.traverse( ( obj ) => {

		if ( obj.isMesh ) {

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

	controls.update();
	updateHover();
	renderPipeline.render();

}
