// "share the love": a Christmas card made from the player's own cookies.
// The cookies they decorated are set out on a plate (on a gingham tablecloth, in their own little
// scene) and photographed; the photo goes in a Christmas frame (a candy-cane border, holly,
// snowflakes) under "Happy Christmas!". On the back of the card goes their own message (up to 150
// characters). Then it can be shared: through the device's share sheet (Instagram, Facebook,
// WhatsApp, messages, mail...) where there is one, or downloaded, or copied, to post anywhere.
import * as THREE from 'three/webgpu';
import { renderer } from '../stage.js';
import { addReflection } from '../reflections.js';

export const MESSAGE_LENGTH = 150;
const DEFAULT_MESSAGE = 'Merry Christmas! I baked and decorated these cookies just for you.';

const PLATE_SCALE = 0.9; // the plate is smaller than the model's, so the cookies fill it
const COOKIE_SCALE = 0.92; // and they're a bit smaller than on the tray, to sit on its flat middle
const CARD = { width: 1080, height: 1350 }; // (portrait 4:5: the shape Instagram likes)
const PHOTO = { width: 1024, height: 864 }; // (a multiple of 32 wide, for reading it back off the GPU)
const TITLE_FONT = '"Mountains of Christmas", "Georgia", serif';
const HAND_FONT = '"Caveat", "Segoe Print", "Bradley Hand", cursive';

// ---------- the photo ----------
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
	const radius = Math.min( 0.095, Math.max( 0.04, size * 1.06 / Math.sin( Math.PI / ring ) ) );
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

// ---------- the card ----------
function rounded( ctx, x, y, w, h, r ) {

	ctx.beginPath();
	ctx.moveTo( x + r, y );
	ctx.arcTo( x + w, y, x + w, y + h, r );
	ctx.arcTo( x + w, y + h, x, y + h, r );
	ctx.arcTo( x, y + h, x, y, r );
	ctx.arcTo( x, y, x + w, y, r );
	ctx.closePath();

}

// the candy-cane stripes round the edge
function candyCane( ctx, band ) {

	const { width: w, height: h } = CARD;
	ctx.save();
	ctx.beginPath();
	ctx.rect( 0, 0, w, h );
	ctx.rect( band, band, w - band * 2, h - band * 2 );
	ctx.clip( 'evenodd' );
	ctx.fillStyle = '#fffaf2';
	ctx.fillRect( 0, 0, w, h );
	ctx.strokeStyle = '#c4202e';
	ctx.lineWidth = 16;
	for ( let i = - h; i < w + h; i += 44 ) {

		ctx.beginPath();
		ctx.moveTo( i, 0 );
		ctx.lineTo( i + h, h );
		ctx.stroke();

	}

	ctx.restore();

}

function snowflake( ctx, x, y, r, alpha ) {

	ctx.save();
	ctx.translate( x, y );
	ctx.strokeStyle = `rgba(255, 255, 255, ${ alpha })`;
	ctx.lineWidth = Math.max( 1.5, r / 7 );
	ctx.lineCap = 'round';
	for ( let i = 0; i < 6; i ++ ) {

		ctx.rotate( Math.PI / 3 );
		ctx.beginPath();
		ctx.moveTo( 0, 0 );
		ctx.lineTo( 0, - r );
		ctx.moveTo( 0, - r * 0.55 );
		ctx.lineTo( - r * 0.25, - r * 0.8 );
		ctx.moveTo( 0, - r * 0.55 );
		ctx.lineTo( r * 0.25, - r * 0.8 );
		ctx.stroke();

	}

	ctx.restore();

}

// a sprig of holly: two leaves and three berries, turned by `angle`
function holly( ctx, x, y, size, angle ) {

	ctx.save();
	ctx.translate( x, y );
	ctx.rotate( angle );
	for ( const side of [ - 1, 1 ] ) {

		ctx.save();
		ctx.rotate( side * 0.55 );
		ctx.fillStyle = side < 0 ? '#1f6b3a' : '#2c8048';
		ctx.beginPath();
		// a leaf with its spiky edge: points along it, in and out
		const l = size;
		ctx.moveTo( 0, 0 );
		const points = 4;
		for ( let i = 1; i <= points; i ++ ) {

			const t = i / points;
			ctx.quadraticCurveTo( l * ( t - 0.12 ), - l * 0.32 * Math.sin( Math.PI * t ) * 0.5, l * t, - l * 0.26 * Math.sin( Math.PI * t ) - ( i < points ? l * 0.06 : 0 ) );

		}

		for ( let i = points - 1; i >= 0; i -- ) {

			const t = i / points;
			ctx.quadraticCurveTo( l * ( t + 0.12 ), l * 0.32 * Math.sin( Math.PI * t ) * 0.5, l * t, l * 0.26 * Math.sin( Math.PI * t ) + ( i > 0 ? l * 0.06 : 0 ) );

		}

		ctx.fill();
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo( 0, 0 );
		ctx.lineTo( l * 0.9, 0 );
		ctx.stroke();
		ctx.restore();

	}

	for ( const [ bx, by ] of [ [ - size * 0.1, - size * 0.06 ], [ size * 0.08, - size * 0.12 ], [ 0, size * 0.1 ] ] ) {

		const gradient = ctx.createRadialGradient( bx - size * 0.03, by - size * 0.03, 1, bx, by, size * 0.11 );
		gradient.addColorStop( 0, '#ff6b6b' );
		gradient.addColorStop( 1, '#a3121d' );
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.arc( bx, by, size * 0.11, 0, Math.PI * 2 );
		ctx.fill();

	}

	ctx.restore();

}

// some snowflakes, always in the same places (so the card looks the same each time)
function snow( ctx, area, count, seed ) {

	let s = seed;
	const random = () => ( s = ( s * 16807 ) % 2147483647 ) / 2147483647;
	for ( let i = 0; i < count; i ++ ) snowflake( ctx, area.x + random() * area.w, area.y + random() * area.h, 8 + random() * 16, 0.25 + random() * 0.45 );

}

// the front: the photo in its frame, under "Happy Christmas!"
export function drawFront( photo ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = CARD.width;
	canvas.height = CARD.height;
	const ctx = canvas.getContext( '2d' );
	const { width: w, height: h } = CARD;

	// deep red, darker at the edges
	const background = ctx.createRadialGradient( w / 2, h * 0.45, 100, w / 2, h / 2, h * 0.75 );
	background.addColorStop( 0, '#b42630' );
	background.addColorStop( 1, '#6e0f17' );
	ctx.fillStyle = background;
	ctx.fillRect( 0, 0, w, h );
	snow( ctx, { x: 40, y: 40, w: w - 80, h: h - 80 }, 46, 7 );
	candyCane( ctx, 26 );

	// the title
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	ctx.font = `700 118px ${ TITLE_FONT }`;
	ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
	ctx.fillText( 'Happy Christmas!', w / 2 + 4, 191 );
	const gold = ctx.createLinearGradient( 0, 95, 0, 195 );
	gold.addColorStop( 0, '#fff4c9' );
	gold.addColorStop( 1, '#f1c04d' );
	ctx.fillStyle = gold;
	ctx.fillText( 'Happy Christmas!', w / 2, 187 );

	// the photo, in a white mount with a gold line
	const pw = 900;
	const ph = Math.round( pw * photo.height / photo.width );
	const px = ( w - pw ) / 2;
	const py = 250;
	ctx.save();
	ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
	ctx.shadowBlur = 30;
	ctx.shadowOffsetY = 10;
	ctx.fillStyle = '#fffaf2';
	rounded( ctx, px - 22, py - 22, pw + 44, ph + 44, 30 );
	ctx.fill();
	ctx.restore();
	ctx.save();
	rounded( ctx, px, py, pw, ph, 18 );
	ctx.clip();
	ctx.drawImage( photo, px, py, pw, ph );
	ctx.restore();
	ctx.strokeStyle = '#d9a93a';
	ctx.lineWidth = 4;
	rounded( ctx, px - 9, py - 9, pw + 18, ph + 18, 24 );
	ctx.stroke();

	// holly on the corners of the frame
	holly( ctx, px - 6, py - 6, 120, - 0.75 );
	holly( ctx, px + pw + 6, py - 6, 120, - 2.4 );
	holly( ctx, px - 6, py + ph + 6, 100, 0.75 );
	holly( ctx, px + pw + 6, py + ph + 6, 100, 2.4 );

	// and underneath
	ctx.font = `600 54px ${ HAND_FONT }`;
	ctx.fillStyle = '#fff3e0';
	ctx.fillText( 'Baked & decorated with love', w / 2, py + ph + 100 );
	ctx.font = `500 22px system-ui, sans-serif`;
	ctx.fillStyle = 'rgba(255, 243, 224, 0.7)';
	ctx.fillText( 'COOKIE BAKING SIMULATOR', w / 2, h - 52 );

	return canvas;

}

// the words wrapped to fit `width`
function wrap( ctx, text, width ) {

	const lines = [];
	for ( const paragraph of text.split( '\n' ) ) {

		let line = '';
		for ( const word of paragraph.split( /\s+/ ) ) {

			const next = line ? `${ line } ${ word }` : word;
			if ( ctx.measureText( next ).width > width && line ) {

				lines.push( line );
				line = word;

			} else line = next;

		}

		lines.push( line );

	}

	return lines;

}

// the back: their message, handwritten
export function drawBack( message ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = CARD.width;
	canvas.height = CARD.height;
	const ctx = canvas.getContext( '2d' );
	const { width: w, height: h } = CARD;

	// cream paper
	ctx.fillStyle = '#fbf3e4';
	ctx.fillRect( 0, 0, w, h );
	ctx.fillStyle = 'rgba(160, 110, 60, 0.05)';
	for ( let y = 0; y < h; y += 6 ) ctx.fillRect( 0, y, w, 2 );
	candyCane( ctx, 26 );

	holly( ctx, 150, 160, 120, - 0.4 );
	holly( ctx, w - 150, h - 170, 120, 2.7 );

	// the message, as big as fits
	const text = ( message || '' ).trim() || DEFAULT_MESSAGE;
	ctx.textAlign = 'center';
	ctx.fillStyle = '#5a2a16';
	let size = 92;
	let lines;
	do {

		ctx.font = `600 ${ size }px ${ HAND_FONT }`;
		lines = wrap( ctx, text, w - 260 );
		size -= 4;

	} while ( ( lines.length * size * 1.25 > h - 520 || lines.some( ( l ) => ctx.measureText( l ).width > w - 220 ) ) && size > 36 );

	const lineHeight = size * 1.28;
	let y = h / 2 - ( lines.length - 1 ) * lineHeight / 2 + size * 0.3;
	for ( const line of lines ) {

		ctx.fillText( line, w / 2, y );
		y += lineHeight;

	}

	ctx.font = `700 64px ${ TITLE_FONT }`;
	ctx.fillStyle = '#b3202a';
	ctx.fillText( 'Happy Christmas!', w / 2, h - 150 );
	ctx.font = `500 22px system-ui, sans-serif`;
	ctx.fillStyle = 'rgba(90, 42, 22, 0.55)';
	ctx.fillText( 'COOKIE BAKING SIMULATOR', w / 2, h - 52 );
	return canvas;

}

// the fonts the card is written in (from Google Fonts: see index.html); a moment's wait at most
export function cardFonts() {

	const wait = Promise.all( [ `700 60px "Mountains of Christmas"`, `600 60px "Caveat"` ].map( ( f ) => document.fonts.load( f ) ) );
	return Promise.race( [ wait, new Promise( ( resolve ) => setTimeout( resolve, 2500 ) ) ] ).catch( () => {} );

}

export function toBlob( canvas ) {

	return new Promise( ( resolve ) => canvas.toBlob( resolve, 'image/png' ) );

}

export { DEFAULT_MESSAGE };
