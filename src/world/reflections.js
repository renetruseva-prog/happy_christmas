// what the shiny things in the kitchen reflect: the kitchen itself. The room is baked (unlit), so
// a 360° picture of it is taken once, from just above the table, and the ingredients and their
// jars and bowls reflect that: the window, the lamp over the table, the warm walls. How much each
// one reflects depends on what it is: wet egg white and glass a lot, glazed bowls, butter and
// chocolate some, paper and flour hardly at all.
import * as THREE from 'three/webgpu';
import { materials as bowlMaterials } from '../bowl/materials.js';

const SIZE = 256; // each side of the picture (it's blurred for the rougher things anyway)
const FROM = new THREE.Vector3( 0, 1.05, - 0.1 ); // where it's taken from: over the middle of the table

// how much of the room each material reflects (by its name in Blender)
const KITCHEN = {
	M_Jar_Glass: 1.2,
	M_Ceramic_Cream: 0.7,
	M_Ceramic_Red: 0.7,
	M_Ceramic_Blue: 0.7,
	M_Butter: 0.55,
	M_Chocolate: 0.5,
	M_Sprinkle_White: 0.45,
	M_Sugar: 0.5,
	M_Egg: 0.3,
	M_Wood_Butcher: 0.25,
	M_Label_Paper: 0.12,
	M_Label_Red: 0.12,
	M_Label_Text_White: 0.12,
	M_Label_Text_Dark: 0.12,
	M_Wrapper: 0.2,
	M_Flour_Bag: 0.08,
};

// and what goes in the bowl (see bowl/materials.js); roughness: made a little glossier too
const BOWL = {
	eggWhite: { reflect: 1.3 },
	eggWhiteDrop: { reflect: 1.3 },
	yolk: { reflect: 1.0 },
	sugar: { reflect: 0.9 },
	sugarGrain: { reflect: 1.0 },
	dough: { reflect: 0.45, roughness: 0.6 }, // (buttery: a soft sheen)
	flour: { reflect: 0.06 },
	flourGrain: { reflect: 0.06 },
	stream: { reflect: 0.06 },
};

let target = null;
let reflectNow = null;
let room = null;
const later = []; // things made before the picture was taken: [ material, amount ]

export function initReflections( kitchen ) {

	room = kitchen;

}

// takes the picture: on the first frame, when the renderer is ready (call it every frame)
export function updateReflections( renderer, scene ) {

	if ( target || ! room ) return;

	target = new THREE.CubeRenderTarget( SIZE, { type: THREE.HalfFloatType } );
	target.texture.name = 'Kitchen_Reflection';
	const camera = new THREE.CubeCamera( 0.05, 30, target );
	camera.position.copy( FROM );

	// just the room: the props on the table move about (and the bowl right under the camera
	// would fill half the picture), so they're left out
	const bowlStuff = new Set( Object.values( bowlMaterials ) );
	const hidden = [];
	scene.traverse( ( obj ) => {

		if ( obj.isMesh && obj.visible && ( obj.castShadow || bowlStuff.has( obj.material ) ) ) {

			obj.visible = false;
			hidden.push( obj );

		}

	} );

	scene.add( camera );
	camera.update( renderer, scene );
	scene.remove( camera );
	for ( const obj of hidden ) obj.visible = true;

	const reflect = ( material, amount ) => {

		material.envMap = target.texture;
		material.envMapIntensity = amount;
		material.needsUpdate = true;

	};

	reflectNow = reflect;
	for ( const [ material, amount ] of later ) reflect( material, amount );

	const done = new Set();
	room.traverse( ( obj ) => {

		if ( ! obj.isMesh ) return;
		for ( const material of [ obj.material ].flat() ) {

			const amount = KITCHEN[ material.name ];
			if ( amount === undefined || done.has( material ) ) continue;
			reflect( material, amount );
			done.add( material );

		}

	} );

	for ( const [ name, { reflect: amount, roughness } ] of Object.entries( BOWL ) ) {

		const material = bowlMaterials[ name ];
		if ( ! material ) continue;
		if ( roughness !== undefined ) material.roughness = roughness;
		reflect( material, amount );

	}

}

// something made later on (the icing, the sprinkles): reflects the kitchen too
export function addReflection( material, amount ) {

	if ( reflectNow ) reflectNow( material, amount );
	else later.push( [ material, amount ] );

}
