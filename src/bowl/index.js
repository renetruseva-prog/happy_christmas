// the mixing bowl: what happens when an ingredient goes in (flour and sugar are poured, an egg is
// cracked, the butter is dropped), mixing it all into dough, and emptying it again.
// The details live next to this file:
//   contents.js  the bowl's inside and the heaps that build up in it
//   materials.js how flour, sugar, egg and dough look
//   particles.js falling grains, flour dust and the flour stream
//   pour.js / egg.js / butter.js  each ingredient going in
import * as THREE from 'three/webgpu';
import { cancelTween } from '../tween.js';
import { ease } from '../sequence.js';
import { initContents, bowl, layers, solids, surfaceY, Layer } from './contents.js';
import { initMaterials, materials, swirl } from './materials.js';
import { initParticles, updateParticles, particles } from './particles.js';
import { setupContainers, pourIntoBowl, restorePour } from './pour.js';
import { crackEgg, restoreEgg } from './egg.js';
import { unwrapButter, dropButter, restoreButter } from './butter.js';

export { bowlInfo, isOverBowl } from './contents.js';

export function initBowl( world, scene, camera ) {

	initContents( { scene, camera, room: world.room, bowlMesh: world.bowl } );

	// the bowl starts empty (the finished dough in it in the Blender file isn't used)
	const readyDough = world.room.getObjectByName( 'Mixing_Bowl_Dough' );
	if ( readyDough ) readyDough.visible = false;

	initMaterials();
	initParticles();
	setupContainers();
	unwrapButter();

}

// ---------- the ingredients ----------
// play the ingredient going into the bowl; resolves when it's in
export function addToBowl( root ) {

	cancelTween( root );
	switch ( root.userData.action ) {

		case 'pour': return pourIntoBowl( root );
		case 'crack': return crackEgg( root );
		case 'drop': return dropButter( root );
		default: root.visible = false; return Promise.resolve();

	}

}

// an ingredient that was already in the bowl before a page refresh: show the end result straight away
export function restoreInBowl( root ) {

	switch ( root.userData.action ) {

		case 'pour': return restorePour( root );
		case 'crack': return restoreEgg( root );
		case 'drop': return restoreButter( root );
		default: root.visible = false;

	}

}

// ---------- mixing ----------
let dough = null;

// how high the bowl's contents reach at (x, z)
export function contentsTop( x, z ) {

	return surfaceY( x, z );

}

// p 0 → 1: the dough rises from the bottom of the bowl until it covers everything, while the
// yolks and the butter get mixed in. turn: how far the mixer has spun (churns the dough's pattern)
export function mixDough( p, turn = 0 ) {

	if ( ! dough ) {

		// high enough to cover the tallest thing in the bowl
		const floor = bowl.rimY - bowl.radius;
		let top = floor;
		for ( let i = 0; i < 300; i ++ ) {

			const a = Math.random() * Math.PI * 2;
			const r = Math.sqrt( Math.random() ) * bowl.radius * 0.8;
			top = Math.max( top, surfaceY( bowl.center.x + Math.cos( a ) * r, bowl.center.z + Math.sin( a ) * r ) );

		}

		for ( const s of solids ) {

			top = Math.max( top, new THREE.Box3().setFromObject( s ).max.y );
			s.userData.mixScale = s.scale.clone();

		}

		dough = new Layer( { x: bowl.center.x, z: bowl.center.z, radius: bowl.radius * 1.2, height: top - floor + 0.008, material: materials.dough, lumps: 0.15, clumps: 0.002, bottom: floor } );

	}

	const k = THREE.MathUtils.clamp( p, 0, 1 );
	dough.setGrowth( ease( k ) );
	swirl.value = turn;

	for ( const s of solids ) {

		const left = 1 - ease( THREE.MathUtils.clamp( ( k - 0.15 ) / 0.6, 0, 1 ) );
		s.scale.copy( s.userData.mixScale ).multiplyScalar( Math.max( left, 0.001 ) );
		s.visible = left > 0.01;

	}

	if ( k >= 1 ) {

		// only the dough is left
		for ( const layer of layers ) if ( layer !== dough ) layer.mesh.visible = false;
		particles.sugar.clear();

	}

}

// the dough is taken out of the bowl: nothing is left in it
export function emptyBowl() {

	for ( const layer of layers ) layer.mesh.visible = false;
	for ( const s of solids ) s.visible = false;
	particles.sugar.clear();

}

export function updateBowl( dt ) {

	updateParticles( dt );

}
