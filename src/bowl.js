// the mixing bowl: where things rest in it, and the flour/sugar mounds that build up inside
import * as THREE from 'three/webgpu';

let kitchen = null;
let bowl = null;
let level = null; // world height of the top of whatever is in the bowl so far

// how each poured ingredient piles up in the bowl (sizes are fractions of the bowl's half-width)
// flour settles into a soft, low heap; sugar is free-flowing and forms a steeper cone
// (a pile of grains rests at an angle of about 32°, so height is about 0.62 x radius)
const FILLS = {
	Flour: { color: 0xf7f2e8, radius: 0.62, height: 0.17, bumpy: 0.03, speckle: 10, roughness: 1, profile: ( r ) => ( 1 - r * r ) ** 2 },
	Sugar: { color: 0xfff0d2, radius: 0.5, height: 0.31, bumpy: 0.1, speckle: 60, roughness: 0.5, profile: ( r ) => Math.max( 0, 1 - Math.sqrt( r * r + 0.006 ) + Math.sqrt( 0.006 ) ) },
};

export function initBowl( room, bowlMesh ) {

	kitchen = room;
	bowl = bowlMesh;

}

function bowlBox() {

	kitchen.updateMatrixWorld( true );
	return new THREE.Box3().setFromObject( bowl );

}

export function isOverBowl( raycaster ) {

	return bowl !== null && raycaster.intersectObject( bowl, true ).length > 0;

}

// the middle of the bowl's opening (world space) and the height of its rim
export function bowlOpening() {

	const box = bowlBox();
	const center = box.getCenter( new THREE.Vector3() );
	return { center, rimY: box.max.y };

}

export function bowlHalfWidth() {

	const size = bowlBox().getSize( new THREE.Vector3() );
	return Math.min( size.x, size.z ) / 2;

}

// where the inside floor of the bowl is: shoot a ray straight down the middle and see where it lands.
// (the bowl's faces may point outwards, so both sides are made hittable just for this ray)
function measureFloor() {

	const box = bowlBox();
	const center = box.getCenter( new THREE.Vector3() );
	const meshes = [];
	bowl.traverse( ( o ) => o.isMesh && meshes.push( o ) );
	const sides = meshes.map( ( m ) => m.material.side );
	meshes.forEach( ( m ) => { m.material.side = THREE.DoubleSide; } );

	const ray = new THREE.Raycaster( new THREE.Vector3( center.x, box.max.y + 0.5, center.z ), new THREE.Vector3( 0, - 1, 0 ) );
	const hit = ray.intersectObject( bowl, true )[ 0 ];
	meshes.forEach( ( m, i ) => { m.material.side = sides[ i ]; } );

	// no hit: fall back to a guess a bit over a third of the way up the bowl
	return hit ? hit.point.y + 0.002 : box.min.y + ( box.max.y - box.min.y ) * 0.38;

}

// world height of the top of whatever is in the bowl so far
export function bowlLevel() {

	if ( level === null ) level = measureFloor();
	return level;

}

export function raiseLevel( dy ) {

	level = bowlLevel() + dy;

}

// where the n-th whole item (butter) rests in the bowl: spread around the middle (world space)
export function bowlSlot( index ) {

	const { center, rimY } = bowlOpening();
	const angle = index * 2.4;
	const radius = index === 0 ? 0 : 0.035;
	return new THREE.Vector3( center.x + Math.cos( angle ) * radius, rimY - 0.07, center.z + Math.sin( angle ) * radius );

}

export function fillColor( kind ) {

	return FILLS[ kind ].color;

}

// a heap seen from above: rings from the middle outwards, height from profile( r ) with r 0..1.
// bumpy roughens the surface, outline makes the edge irregular (for a puddle)
export function heapGeometry( profile, bumpy = 0, outline = 0 ) {

	const rings = 28;
	const segments = 64;
	const positions = [];
	const uvs = [];
	const indices = [];

	for ( let i = 0; i <= rings; i ++ ) {

		const r = i / rings;
		for ( let j = 0; j <= segments; j ++ ) {

			const a = ( j / segments ) * Math.PI * 2;
			const edge = 1 + outline * ( Math.sin( a * 3 + 1.3 ) * 0.5 + Math.sin( a * 5 + 0.2 ) * 0.3 + Math.sin( a * 8 ) * 0.2 );
			const rr = r * edge;
			const grain = Math.sin( rr * 53 + a * 7 ) * Math.cos( a * 11 - rr * 29 ) + Math.sin( ( rr * 127.1 + a * 311.7 ) * 12.9898 ) * 0.5;
			const y = profile( r ) * ( 1 + bumpy * grain * ( r < 0.97 ? 1 : 0 ) );
			positions.push( rr * Math.cos( a ), Math.max( 0, y ), rr * Math.sin( a ) );
			uvs.push( rr * Math.cos( a ) * 0.5 + 0.5, rr * Math.sin( a ) * 0.5 + 0.5 );

		}

	}

	for ( let i = 0; i < rings; i ++ ) {

		for ( let j = 0; j < segments; j ++ ) {

			const a = i * ( segments + 1 ) + j;
			const b = a + segments + 1;
			indices.push( a, a + 1, b, b, a + 1, b + 1 );

		}

	}

	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.Float32BufferAttribute( positions, 3 ) );
	geo.setAttribute( 'uv', new THREE.Float32BufferAttribute( uvs, 2 ) );
	geo.setIndex( indices );
	geo.computeVertexNormals();
	return geo;

}

// fine speckle so the mound reads as powder / crystals instead of flat paint
function grainTexture( hex, speckle ) {

	const size = 256;
	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext( '2d' );
	const img = ctx.createImageData( size, size );
	const base = new THREE.Color( hex );

	for ( let i = 0; i < size * size; i ++ ) {

		const n = ( Math.random() - 0.5 ) * speckle / 255 * 2;
		const sparkle = Math.random() > 0.985 ? 0.15 : 0;
		img.data[ i * 4 ] = Math.min( 255, ( base.r + n + sparkle ) * 255 );
		img.data[ i * 4 + 1 ] = Math.min( 255, ( base.g + n + sparkle ) * 255 );
		img.data[ i * 4 + 2 ] = Math.min( 255, ( base.b + n + sparkle ) * 255 );
		img.data[ i * 4 + 3 ] = 255;

	}

	ctx.putImageData( img, 0, 0 );
	const texture = new THREE.CanvasTexture( canvas );
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set( 4, 4 );
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;

}

// a heap of flour or sugar in the bowl; grow( 0..1 ) pours it in (it widens and rises). Later heaps sit on top.
export function addFill( kind ) {

	const spec = FILLS[ kind ];
	const box = bowlBox();
	const center = box.getCenter( new THREE.Vector3() );
	const half = bowlHalfWidth();

	const floorY = bowlLevel();
	const radius = half * spec.radius;
	const height = half * spec.height;
	raiseLevel( height * 0.6 );

	const material = new THREE.MeshStandardNodeMaterial( { map: grainTexture( spec.color, spec.speckle ), roughness: spec.roughness, side: THREE.DoubleSide } );
	const mesh = new THREE.Mesh( heapGeometry( spec.profile, spec.bumpy ), material );
	mesh.position.copy( kitchen.worldToLocal( new THREE.Vector3( center.x, floorY, center.z ) ) );
	mesh.scale.set( 0.001, 0.001, 0.001 );
	mesh.receiveShadow = true;
	kitchen.add( mesh );

	let grown = 0;

	return {
		// where falling grains land right now: the tip of the heap (world space)
		surface: () => floorY + height * grown,
		grow( k ) {

			grown = k;
			const wide = 0.4 + 0.6 * k;
			mesh.scale.set( Math.max( radius * wide * Math.min( 1, k * 20 ), 0.001 ), Math.max( height * k, 0.001 ), Math.max( radius * wide * Math.min( 1, k * 20 ), 0.001 ) );

		},
	};

}
