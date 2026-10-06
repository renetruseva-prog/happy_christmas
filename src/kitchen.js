// loads the Blender kitchen and prepares its materials, lights and camera
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LIGHT_SCALE, BAKE_BOOST } from './config.js';
import { trackLight, trackBulb } from './lights.js';

export async function loadKitchen( scene, camera, controls ) {

	const gltf = await new GLTFLoader().loadAsync( '/models/kitchen.glb' );
	const room = gltf.scene;
	const interactables = []; // everything marked "interactable" in Blender

	room.traverse( ( obj ) => {

		if ( obj.isMesh && obj.name.startsWith( 'XLights_Bulbs' ) ) trackBulb( obj );

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

			trackLight( obj );

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

	return { room, bowl: room.getObjectByName( 'Mixing_Bowl' ), interactables };

}
