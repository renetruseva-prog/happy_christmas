// the photo on the card: the decorated cookies set out on a plate, on a gingham tablecloth, in a
// little scene of their own, photographed off the GPU into a canvas (see cardArt.js for the card
// it goes into)
import * as THREE from 'three/webgpu';
import { renderer } from '../core/stage.js';
import { addReflection } from '../world/reflections.js';

const PLATE_SCALE = 0.9; // the plate is smaller than the model's, so the cookies fill it
const COOKIE_SCALE = 2; // and the cookies are a bit bigger than on the tray, so they fill the plate like real ones would
const PHOTO = { width: 1024, height: 864 }; // (a multiple of 32 wide, for reading it back off the GPU)

function gingham() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 128;
	const ctx = canvas.getContext( '2d' );
	ctx.fillStyle = '#fbf6ee';
	ctx.fillRect( 0, 0, 128, 128 );
	ctx.fillStyle = 'rgba(178, 32, 42, 0.55)';
	ctx.fillRect( 0, 0, 64, 128 );
	ctx.fillRect( 0, 0, 128, 64 );
	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.repeat.set( 12, 12 );
	texture.anisotropy = 8;
	return texture;

}

// a white plate with a red line round the rim (a profile turned round its middle)
function plate() {

	const profile = [ [ 0, 0.004 ], [ 0.14, 0.004 ], [ 0.165, 0.009 ], [ 0.2, 0.02 ], [ 0.214, 0.024 ], [ 0.22, 0.021 ], [ 0.212, 0.014 ], [ 0.17, 0.004 ], [ 0.14, 0 ], [ 0, 0 ] ].map( ( [ r, h ] ) => new THREE.Vector2( r, h ) );
	const china = new THREE.MeshPhysicalNodeMaterial( { color: 0xfbf8f2, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.1, side: THREE.DoubleSide } ); // (the turned profile faces both ways)
	addReflection( china, 0.8 );
	const group = new THREE.Group();
	const dish = new THREE.Mesh( new THREE.LatheGeometry( profile, 128 ), china );
	dish.receiveShadow = dish.castShadow = true;
	const line = new THREE.Mesh( new THREE.TorusGeometry( 0.2065, 0.0016, 8, 160 ).rotateX( Math.PI / 2 ), new THREE.MeshPhysicalNodeMaterial( { color: 0xb3202a, roughness: 0.3, clearcoat: 0.6 } ) );
	line.position.y = 0.0205;
	group.add( dish, line );
	group.position.y = 0.0005; // (just off the cloth)
	group.scale.setScalar( PLATE_SCALE );
	return group;

}

// where n cookies go on the plate (as many as fit in a ring, the sixth in the middle)
function layout( n, size ) {

	if ( n === 1 ) return [ [ 0, 0, 0 ] ];
	const ring = n === 6 ? 5 : n;
	const radius = Math.min( 0.115, Math.max( 0.04, size * 1.06 / Math.sin( Math.PI / ring ) ) );
	const spots = [];
	for ( let i = 0; i < ring; i ++ ) {

		const a = i / ring * Math.PI * 2 - Math.PI / 2;
		spots.push( [ Math.cos( a ) * radius, Math.sin( a ) * radius, 0 ] );

	}

	if ( n === 6 ) spots.push( [ 0, 0, 0.007 ] ); // (on top, in the middle)
	return spots;

}

// a half float (as it comes off the GPU) to a number, by table
let halves = null;
function halfTable() {

	if ( ! halves ) {

		halves = new Float32Array( 65536 );
		for ( let i = 0; i < 65536; i ++ ) halves[ i ] = THREE.DataUtils.fromHalfFloat( i );

	}

	return halves;

}

// light (linear, can be over 1) to a screen colour: Khronos "PBR Neutral" tone mapping (it keeps the
// icing's colours true), then sRGB
function toScreen( r, g, b, out ) {

	const x = Math.min( r, g, b );
	const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	r -= offset;
	g -= offset;
	b -= offset;
	const peak = Math.max( r, g, b );
	const start = 0.76;
	if ( peak >= start ) {

		const d = 1 - start;
		const top = 1 - d * d / ( peak + d - start );
		r *= top / peak;
		g *= top / peak;
		b *= top / peak;
		const grey = 1 - 1 / ( 0.15 * ( peak - top ) + 1 );
		r += ( top - r ) * grey;
		g += ( top - g ) * grey;
		b += ( top - b ) * grey;

	}

	const s = ( c ) => {

		c = Math.min( Math.max( c, 0 ), 1 );
		return Math.round( 255 * ( c <= 0.0031308 ? c * 12.92 : 1.055 * c ** ( 1 / 2.4 ) - 0.055 ) );

	};
	out[ 0 ] = s( r );
	out[ 1 ] = s( g );
	out[ 2 ] = s( b );

}

// photograph the cookies on a plate: returns a canvas
export async function snapCookies( cookies ) {

	const scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x2a1610 );
	const cloth = gingham();
	const table = new THREE.Mesh( new THREE.PlaneGeometry( 3, 3 ).rotateX( - Math.PI / 2 ), new THREE.MeshStandardNodeMaterial( { map: cloth, roughness: 0.95 } ) );
	table.receiveShadow = true;
	scene.add( table, plate() );

	scene.add( new THREE.HemisphereLight( 0xfff3e2, 0x6b3a28, 1.1 ) );
	const sun = new THREE.DirectionalLight( 0xfff0dc, 3.2 );
	sun.position.set( - 0.35, 0.9, 0.3 );
	sun.castShadow = true;
	sun.shadow.mapSize.set( 2048, 2048 );
	sun.shadow.camera.left = sun.shadow.camera.bottom = - 0.35;
	sun.shadow.camera.right = sun.shadow.camera.top = 0.35;
	sun.shadow.camera.near = 0.2;
	sun.shadow.camera.far = 2;
	sun.shadow.bias = - 0.0004;
	sun.shadow.normalBias = 0.004;
	const fill = new THREE.PointLight( 0xffc890, 0.25, 2 );
	fill.position.set( 0.4, 0.3, 0.4 );
	scene.add( sun, fill );

	// the cookies, copied (with their icing, chips and sprinkles), lying flat on the plate
	const size = Math.max( ...cookies.map( ( c ) => {

		c.geometry.computeBoundingSphere();
		return c.geometry.boundingSphere.radius;

	} ) );
	const spots = layout( cookies.length, size * COOKIE_SCALE );
	const flat = new THREE.Quaternion().setFromEuler( new THREE.Euler( - Math.PI / 2, 0, 0 ) );
	cookies.forEach( ( cookie, i ) => {

		const copy = cookie.clone( true );
		const [ x, z, lift ] = spots[ i ];
		const centre = cookie.geometry.boundingSphere.center;
		copy.quaternion.setFromAxisAngle( new THREE.Vector3( 0, 1, 0 ), ( Math.random() - 0.5 ) * 0.7 ).multiply( flat );
		copy.scale.setScalar( COOKIE_SCALE );
		// (its middle on the spot: the cookie's own middle isn't where its origin is)
		const middle = new THREE.Vector3( centre.x, centre.y, 0 ).multiplyScalar( COOKIE_SCALE ).applyQuaternion( copy.quaternion );
		copy.position.set( x - middle.x, 0.0051 + lift, z - middle.z );
		copy.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = true; } );
		scene.add( copy );

	} );

	// framed on the whole plate, with the cloth round it
	const camera = new THREE.PerspectiveCamera( 30, PHOTO.width / PHOTO.height, 0.02, 10 );
	camera.position.set( 0, 0.83, 0.56 ).normalize().multiplyScalar( 0.7 );
	camera.position.z += 0.015;
	camera.lookAt( 0, 0, 0.015 );

	// photographed into a picture of its own, then read back
	const target = new THREE.RenderTarget( PHOTO.width, PHOTO.height, { type: THREE.HalfFloatType, samples: 4 } );
	const before = renderer.getRenderTarget();
	renderer.setRenderTarget( target );
	renderer.render( scene, camera );
	renderer.setRenderTarget( before );
	const pixels = await renderer.readRenderTargetPixelsAsync( target, 0, 0, PHOTO.width, PHOTO.height );
	target.dispose();
	cloth.dispose();

	const canvas = document.createElement( 'canvas' );
	canvas.width = PHOTO.width;
	canvas.height = PHOTO.height;
	const ctx = canvas.getContext( '2d' );
	const image = ctx.createImageData( PHOTO.width, PHOTO.height );
	const table16 = halfTable();
	const rgb = [ 0, 0, 0 ];
	const exposure = 1.05;
	for ( let i = 0; i < PHOTO.width * PHOTO.height; i ++ ) {

		toScreen( table16[ pixels[ i * 4 ] ] * exposure, table16[ pixels[ i * 4 + 1 ] ] * exposure, table16[ pixels[ i * 4 + 2 ] ] * exposure, rgb );
		image.data[ i * 4 ] = rgb[ 0 ];
		image.data[ i * 4 + 1 ] = rgb[ 1 ];
		image.data[ i * 4 + 2 ] = rgb[ 2 ];
		image.data[ i * 4 + 3 ] = 255;

	}

	ctx.putImageData( image, 0, 0 );
	return canvas;

}
