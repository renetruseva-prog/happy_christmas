// the dough on the table and the flour dusted under it. The dough is one soft round slab that's
// stretched to its current shape: a ball fresh out of the bowl (progress 0), a thin sheet when
// it's rolled out (1). The amount of dough stays the same, so thinner means wider.
import * as THREE from 'three/webgpu';
import { color, float, mix, mx_noise_float, positionWorld, smoothstep, uniform, uv } from 'three/tsl';
import { ease } from '../sequence.js';

const BALL = { radius: 0.055, thickness: 0.05 }; // fresh out of the bowl
const SHEET_THICKNESS = 0.007; // rolled out (about 7 mm, like real cookie dough)
const STRETCH = 0.15; // rolling stretches it a bit more in the direction it's rolled

// how much flour is dusted (0..1), for fading it in
export const flourAmount = uniform( 0 );

// a soft slab: round from above, with a flattish top and bottom and rounded edges
// (a squashed "superellipse" turned around its axis). 1 wide, 1 tall, bottom at 0
function slabGeometry() {

	const points = [];
	const n = 3;
	for ( let i = 0; i <= 24; i ++ ) {

		const t = - Math.PI / 2 + Math.PI * i / 24;
		const c = Math.cos( t );
		const s = Math.sin( t );
		points.push( new THREE.Vector2( Math.abs( c ) ** ( 2 / n ), Math.sign( s ) * Math.abs( s ) ** ( 2 / n ) * 0.5 + 0.5 ) );

	}

	return new THREE.LatheGeometry( points, 64 );

}

export function makeDough() {

	const material = new THREE.MeshStandardNodeMaterial( { roughness: 0.8 } );
	const mottle = mx_noise_float( positionWorld.mul( 60 ) ).mul( 0.5 ).add( 0.5 );
	material.colorNode = mix( color( 0xc8975a ), color( 0xebd2a2 ), mottle ).mul( mx_noise_float( positionWorld.mul( 300 ) ).mul( 0.06 ).add( 0.97 ) );
	const mesh = new THREE.Mesh( slabGeometry(), material );
	mesh.name = 'Rolled_Dough';
	mesh.castShadow = mesh.receiveShadow = true;
	mesh.visible = false;
	return mesh;

}

// a soft, uneven patch of flour: solid in the middle, speckled and fading towards the edge
export function makeFlour() {

	const material = new THREE.MeshStandardNodeMaterial( { color: 0xf4f1ea, roughness: 1, transparent: true, depthWrite: false } );
	const r = uv().sub( 0.5 ).length().mul( 2 );
	const speckle = mx_noise_float( positionWorld.mul( 400 ) ).mul( 0.5 ).add( 0.5 );
	const edge = float( 1 ).sub( smoothstep( 0.45, 1, r.add( mx_noise_float( positionWorld.mul( 25 ) ).mul( 0.25 ) ) ) );
	material.opacityNode = edge.mul( speckle.mul( 0.45 ).add( 0.5 ) ).mul( flourAmount );
	const mesh = new THREE.Mesh( new THREE.CircleGeometry( 1, 48 ), material );
	mesh.rotation.x = - Math.PI / 2;
	mesh.receiveShadow = true;
	mesh.visible = false;
	return mesh;

}

// how thick the dough is at rolling progress p
export function thickness( p ) {

	return THREE.MathUtils.lerp( BALL.thickness, SHEET_THICKNESS, ease( p ) );

}

// shape the dough for rolling progress p (squash: a moment's squash when it lands). Its local x
// is the rolling direction
export function shapeDough( dough, p, squash = 0 ) {

	const h = thickness( p ) * ( 1 - squash );
	const r = BALL.radius * Math.sqrt( BALL.thickness / thickness( p ) ) * ( 1 + squash * 0.5 );
	const stretch = 1 + STRETCH * ease( p );
	dough.scale.set( r * stretch, h, r / stretch );

}

// how far the dough reaches along the rolling direction right now
export function doughReach( dough ) {

	return dough.scale.x;

}
