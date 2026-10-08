// the cookies cut out of the dough sheet. Each cut leaves:
// - a hole in the sheet: painted into a mask the dough's material reads (where it's black, the
//   dough isn't drawn), with a thin wall of dough around the inside of the hole
// - the cookie itself, sitting in the hole, with softly rounded edges so the cut shows
import * as THREE from 'three/webgpu';
import { positionLocal, texture, uniform } from 'three/tsl';
import { TABLE_TOP } from '../table.js';
import { doughMaterial, SHEET_THICKNESS } from '../rolling/dough.js';
import { bounds, apart, contains } from './outline.js';

const UP = new THREE.Vector3( 0, 1, 0 );
const MASK_SIZE = 1024; // pixels across the whole sheet (about a third of a millimetre each)
const EDGE = 0.9; // how far out a cookie can go (1 = the very edge of the sheet, which is rounded)
const GAP = 0.004; // room to leave between cookies
const ROUNDING = 0.0015; // the cookie's rounded edge

let dough = null;
let mask = null; // the canvas the holes are painted on
let maskTexture = null;
let wallMaterial = null;
let cookieMaterial = null;

// how baked the cookies are: 0 raw, 1 golden, 1.5 burnt (see baking/)
export const bakeLevel = uniform( 0 );

export const cuts = []; // { shape: 'star' | 'drawn', outline, cookie, wall }

export function initCuts( doughMesh ) {

	dough = doughMesh;

	mask = document.createElement( 'canvas' );
	mask.width = mask.height = MASK_SIZE;
	clearMask();
	maskTexture = new THREE.CanvasTexture( mask );
	maskTexture.flipY = false;
	maskTexture.generateMipmaps = false;
	maskTexture.minFilter = THREE.LinearFilter;
	maskTexture.colorSpace = THREE.NoColorSpace;

	// the dough's own coordinates: -1..1 across, whatever its shape (see dough.js)
	const keep = texture( maskTexture, positionLocal.xz.mul( 0.5 ).add( 0.5 ) ).r.greaterThan( 0.5 );
	dough.material.maskNode = keep;
	dough.material.maskShadowNode = keep;
	dough.material.needsUpdate = true;

	wallMaterial = doughMaterial( { side: THREE.BackSide } ); // seen from inside the hole
	cookieMaterial = doughMaterial( { baked: bakeLevel } );

}

function clearMask() {

	const ctx = mask.getContext( '2d' );
	ctx.fillStyle = '#fff';
	ctx.fillRect( 0, 0, MASK_SIZE, MASK_SIZE );

}

// ---------- where a cookie can go ----------
// in the dough's own coordinates, where 1 is its edge
function onSheet( p ) {

	const local = dough.worldToLocal( new THREE.Vector3( p.x, TABLE_TOP, p.z ) );
	return Math.hypot( local.x, local.z ) <= EDGE;

}

// null if a cookie with this outline can be cut, otherwise what's in the way
export function whyNot( outline ) {

	dough.updateMatrixWorld(); // (it may have just been shaped, before a frame has updated it)
	if ( ! outline.every( onSheet ) ) return 'too close to the edge of the dough';
	if ( ! cuts.every( ( cut ) => apart( cut.outline, outline, GAP ) ) ) return 'that overlaps a cookie you already cut';
	return null;

}

// whether (x, z) is in a hole already cut out
export function inCut( x, z ) {

	return cuts.some( ( { outline } ) => {

		const { c, r } = bounds( outline );
		return Math.hypot( x - c.x, z - c.z ) < r && contains( outline, x, z );

	} );

}

// ---------- cutting ----------
// cut out a cookie; returns its mesh
export function cut( outline, shape ) {

	paintHole( outline );

	const { c } = bounds( outline );
	const flat = new THREE.Shape( outline.map( ( p ) => new THREE.Vector2( p.x - c.x, - ( p.z - c.z ) ) ) ); // (laid flat below)

	// the wall around the inside of the hole: only the sides of the shape pushed up
	const wallGeometry = new THREE.ExtrudeGeometry( flat, { depth: SHEET_THICKNESS, bevelEnabled: false } );
	const sides = wallGeometry.groups[ 1 ];
	wallGeometry.setDrawRange( sides.start, sides.count );
	const wall = new THREE.Mesh( wallGeometry, wallMaterial );

	// the cookie, its top and bottom edges rounded in a little
	const cookieGeometry = new THREE.ExtrudeGeometry( flat, {
		depth: SHEET_THICKNESS - ROUNDING * 2,
		bevelEnabled: true,
		bevelThickness: ROUNDING,
		bevelSize: ROUNDING,
		bevelOffset: - ROUNDING,
		bevelSegments: 2,
	} );
	const cookie = new THREE.Mesh( cookieGeometry, cookieMaterial );
	cookie.name = shape === 'star' ? 'Star_Cookie' : 'Cookie';
	cookie.castShadow = cookie.receiveShadow = true;
	cookie.userData.shape = shape;

	for ( const [ mesh, bottom ] of [ [ wall, TABLE_TOP ], [ cookie, TABLE_TOP + ROUNDING ] ] ) {

		mesh.rotation.x = - Math.PI / 2; // the shape's "up" (its z) becomes the world's up
		mesh.position.set( c.x, bottom, c.z );
		dough.parent.add( mesh );

	}

	cookie.userData.cutAt = cookie.position.clone(); // (where it goes back to if it's dropped)
	cuts.push( { shape, outline, cookie, wall } );
	return cookie;

}

function paintHole( outline ) {

	dough.updateMatrixWorld();
	const ctx = mask.getContext( '2d' );
	ctx.fillStyle = '#000';
	ctx.beginPath();
	outline.forEach( ( p, i ) => {

		const local = dough.worldToLocal( new THREE.Vector3( p.x, TABLE_TOP, p.z ) );
		const x = ( local.x * 0.5 + 0.5 ) * MASK_SIZE;
		const y = ( local.z * 0.5 + 0.5 ) * MASK_SIZE;
		if ( i === 0 ) ctx.moveTo( x, y );
		else ctx.lineTo( x, y );

	} );
	ctx.closePath();
	ctx.fill();
	maskTexture.needsUpdate = true;

}

// ---------- saving ----------
// outlines are saved relative to the dough (where it lies and which way it was rolled), so they
// land in the right place even if the dough is put somewhere else after a refresh
export function toSaved( { shape, outline } ) {

	const points = outline.map( ( p ) => {

		const v = new THREE.Vector3( p.x - dough.position.x, 0, p.z - dough.position.z ).applyAxisAngle( UP, - dough.rotation.y );
		return [ + v.x.toFixed( 4 ), + v.z.toFixed( 4 ) ];

	} );
	return { shape, points };

}

export function fromSaved( { points } ) {

	return points.map( ( [ x, z ] ) => {

		const v = new THREE.Vector3( x, 0, z ).applyAxisAngle( UP, dough.rotation.y );
		return { x: v.x + dough.position.x, z: v.z + dough.position.z };

	} );

}
