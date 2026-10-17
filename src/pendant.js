// the lamp over the table swings when something knocks the table. The swing is a clip made in
// Blender (public/models/pendant_swing.glb: a pivot at the ceiling, turning back and forth and
// dying away). The lamp's parts (cord, shade, bulb and its lights, so the light and its shadows
// swing with it) are hung on a pivot placed where the clip's is.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PARTS = [ 'Pendant_Cord_Baked', 'Pendant_Shade_Baked', 'Pendant_Bulb', 'Light_Pendant', 'Light_Pendant_Fill' ];

let mixer = null;
let action = null;

export async function initPendant( room ) {

	let swing;
	try {

		swing = await new GLTFLoader().loadAsync( '/models/pendant_swing.glb' );

	} catch {

		return; // no clip: the lamp just hangs still

	}

	const clip = swing.animations.find( ( a ) => a.name === 'pendant_swing' );
	const where = swing.scene.getObjectByName( 'Pendant_Pivot' );
	if ( ! clip || ! where ) return;

	const pivot = new THREE.Object3D();
	pivot.name = 'Pendant_Pivot';
	pivot.position.copy( where.position );
	room.add( pivot );
	room.updateMatrixWorld( true );
	for ( const name of PARTS ) {

		const part = room.getObjectByName( name );
		if ( part ) pivot.attach( part ); // (keeps where it hangs now)

	}

	mixer = new THREE.AnimationMixer( pivot );
	action = mixer.clipAction( clip );
	action.setLoop( THREE.LoopOnce, 1 );
	action.clampWhenFinished = false;

}

// strength 0..1: how hard it was knocked (also how far it swings)
export function swingPendant( strength = 1 ) {

	if ( ! action ) return;
	action.reset();
	action.setEffectiveWeight( THREE.MathUtils.clamp( strength, 0.1, 1 ) );
	action.play();

}

export function updatePendant( dt ) {

	mixer?.update( dt );

}
