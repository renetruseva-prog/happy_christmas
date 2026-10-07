// cracking an egg into the bowl: tap, a crack line, the shell splits with a jagged edge,
// the thick white slides out slowly with the yolk, spreads into a puddle and the yolk wobbles
import * as THREE from 'three/webgpu';
import { runSequence } from './sequence.js';
import { bowlOpening, bowlHalfWidth, bowlLevel, raiseLevel, heapGeometry } from './bowl.js';

const PUDDLE_RADIUS = 0.06;
const PUDDLE_THICKNESS = 0.009;
const YOLK_RADIUS = 0.017;
const STRING = new THREE.Vector3( 0.012, 0.03, 0.012 ); // the white while it hangs in a thin strand

const ease = ( k ) => k * k * ( 3 - 2 * k );
const easeOut = ( k ) => 1 - ( 1 - k ) ** 3; // fast then slow: how thick liquid spreads
const clamp01 = ( k ) => Math.min( 1, Math.max( 0, k ) );

// half an eggshell with a zig-zag broken rim
function brokenShellHalf() {

	const geo = new THREE.SphereGeometry( 1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2 );
	const pos = geo.attributes.position;
	for ( let i = 0; i < pos.count; i ++ ) {

		const y = pos.getY( i );
		if ( y > 0.15 ) continue;
		const angle = Math.atan2( pos.getZ( i ), pos.getX( i ) );
		const zigzag = ( Math.abs( ( angle * 4.5 ) % 2 - 1 ) - 0.5 ) * 0.2 + Math.sin( angle * 17 ) * 0.03;
		pos.setY( i, y + zigzag * ( 1 - y / 0.15 ) );

	}

	geo.computeVertexNormals();
	return geo;

}

// a thin, wobbly dark ring around the egg: the crack
function crackLine( root ) {

	root.geometry.computeBoundingBox();
	const box = root.geometry.boundingBox;
	const size = box.getSize( new THREE.Vector3() );
	const geo = new THREE.TorusGeometry( 1, 0.025, 4, 56 );
	const pos = geo.attributes.position;
	for ( let i = 0; i < pos.count; i ++ ) pos.setZ( i, pos.getZ( i ) + Math.sin( i * 1.7 ) * 0.04 );

	const ring = new THREE.Mesh( geo, new THREE.MeshBasicNodeMaterial( { color: 0x4a3018 } ) );
	ring.rotation.x = Math.PI / 2;
	ring.scale.setScalar( Math.max( size.x, size.z ) / 2 * 1.01 );
	box.getCenter( ring.position );
	ring.visible = false;
	root.add( ring );
	return ring;

}

function makeContents( kitchen ) {

	// raw egg white is clear and glossy (slightly yellow), so the yolk shows through it.
	// It's a stretched blob while it falls, then a thin glossy puddle with an uneven edge
	const clearWhite = { color: 0xffeebb, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.5 };
	const white = new THREE.Mesh(
		new THREE.SphereGeometry( 1, 32, 16 ),
		new THREE.MeshPhysicalNodeMaterial( clearWhite ),
	);
	const puddle = new THREE.Mesh(
		heapGeometry( ( r ) => 1 - r ** 4, 0, 0.16 ),
		new THREE.MeshPhysicalNodeMaterial( { ...clearWhite, side: THREE.DoubleSide } ),
	);
	const yolk = new THREE.Mesh(
		new THREE.SphereGeometry( 1, 32, 20 ),
		new THREE.MeshPhysicalNodeMaterial( { color: 0xf59300, emissive: 0x2a1200, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 } ),
	);
	yolk.renderOrder = - 1; // draw the yolk before the see-through white around it
	white.scale.setScalar( 0.001 );
	puddle.scale.setScalar( 0.001 );
	yolk.scale.setScalar( YOLK_RADIUS );
	kitchen.add( white, puddle, yolk );
	return { white, puddle, yolk };

}

// where the n-th egg lands in the bowl (world space): around the middle, on top of what's there
function landingSpot( index ) {

	const { center } = bowlOpening();
	const angle = index * 2.4;
	const radius = bowlHalfWidth() * 0.22;
	return new THREE.Vector3( center.x + Math.cos( angle ) * radius, bowlLevel(), center.z + Math.sin( angle ) * radius );

}

function setWorld( kitchen, mesh, v ) {

	mesh.position.copy( kitchen.worldToLocal( v.clone() ) );

}

// an egg that was cracked before a page refresh: just the finished puddle and yolk
export function restoreEgg( kitchen, root, index ) {

	root.visible = false;
	const land = landingSpot( index );
	const { white, puddle, yolk } = makeContents( kitchen );
	white.visible = false;
	puddle.scale.set( PUDDLE_RADIUS, PUDDLE_THICKNESS, PUDDLE_RADIUS );
	setWorld( kitchen, puddle, land );
	setWorld( kitchen, yolk, land.clone().add( new THREE.Vector3( 0, PUDDLE_THICKNESS + YOLK_RADIUS * 0.45, 0 ) ) );
	yolk.scale.set( YOLK_RADIUS, YOLK_RADIUS * 0.85, YOLK_RADIUS );
	raiseLevel( 0.006 );

}

export async function crackIntoBowl( kitchen, root, index ) {

	const { center, rimY } = bowlOpening();
	const aboveLocal = kitchen.worldToLocal( new THREE.Vector3( center.x, rimY + 0.22, center.z ) );
	const land = landingSpot( index );
	raiseLevel( 0.006 );

	const startPos = root.position.clone();
	const size = new THREE.Box3().setFromObject( root ).getSize( new THREE.Vector3() );
	const crack = crackLine( root );

	// the two halves of the shell, in the egg's own size and colour
	const shellGeometry = brokenShellHalf();
	const shellMaterial = root.material.clone();
	shellMaterial.side = THREE.DoubleSide;
	const shellTop = new THREE.Mesh( shellGeometry, shellMaterial );
	const shellBottom = new THREE.Mesh( shellGeometry, shellMaterial );
	shellTop.visible = shellBottom.visible = false;
	kitchen.add( shellTop, shellBottom );
	const shellScale = new THREE.Vector3( size.x / 2, size.y / 2, size.z / 2 );
	const inside = shellScale.clone().multiplyScalar( 0.88 ); // the white fills the shell

	const { white, puddle, yolk } = makeContents( kitchen );
	white.visible = puddle.visible = yolk.visible = false;
	const yolkEnd = land.clone().add( new THREE.Vector3( 0, PUDDLE_THICKNESS + YOLK_RADIUS * 0.45, 0 ) );

	const eggPoint = new THREE.Vector3();
	const pos = new THREE.Vector3();

	await runSequence( [
		{
			// carry it over the bowl
			duration: 0.5,
			update: ( k ) => root.position.lerpVectors( startPos, aboveLocal, ease( k ) ),
		},
		{
			// two taps on the rim; the crack shows up on the first
			duration: 0.6,
			update: ( k ) => {

				root.position.y = aboveLocal.y - Math.abs( Math.sin( k * Math.PI * 2 ) ) * 0.025;
				root.rotation.z = Math.sin( k * Math.PI * 6 ) * 0.1 * ( 1 - k );
				crack.visible = k > 0.25;

			},
			end: () => {

				// the egg is replaced by two shell halves; the white and yolk are inside
				root.getWorldPosition( eggPoint );
				root.visible = false;
				for ( const shell of [ shellTop, shellBottom ] ) {

					shell.visible = true;
					shell.scale.copy( shellScale );
					setWorld( kitchen, shell, eggPoint );

				}

				shellBottom.rotation.x = Math.PI;
				white.visible = yolk.visible = true;
				white.scale.copy( inside );
				setWorld( kitchen, white, eggPoint );
				setWorld( kitchen, yolk, eggPoint );

			},
		},
		{
			// the shell pulls apart
			duration: 0.5,
			update: ( k ) => {

				const open = ease( k );
				shellTop.rotation.z = open * 1.1;
				shellBottom.rotation.z = - open * 1.1;
				setWorld( kitchen, shellTop, pos.set( eggPoint.x - open * 0.035, eggPoint.y + open * 0.02, eggPoint.z ) );
				setWorld( kitchen, shellBottom, pos.set( eggPoint.x + open * 0.035, eggPoint.y - open * 0.01, eggPoint.z ) );

			},
		},
		{
			// the yolk drops out first, wrapped in the clear white, which stretches into a strand behind it;
			// it hits the bowl, the white spreads out around the yolk and the yolk wobbles
			duration: 2.2,
			update: ( k ) => {

				const yolkFall = ease( clamp01( k / 0.5 ) );
				const fall = ease( clamp01( k / 0.55 ) );
				const spread = easeOut( clamp01( ( k - 0.52 ) / 0.48 ) );

				// the shells fall away and shrink
				const vanish = ease( clamp01( ( k - 0.1 ) / 0.3 ) );
				shellTop.scale.copy( shellScale ).multiplyScalar( 1 - vanish + 0.001 );
				shellBottom.scale.copy( shellScale ).multiplyScalar( 1 - vanish + 0.001 );

				// white: from the shape of the inside of the egg to a thin strand hanging above the yolk,
				// then it's absorbed into the puddle
				if ( k < 0.6 ) {

					white.visible = true;
					white.scale.lerpVectors( inside, STRING, fall );
					// it stays wrapped around the yolk, stretching upwards behind it as it falls
					pos.lerpVectors( eggPoint, yolkEnd, yolkFall * yolkFall );
					pos.y += STRING.y * 0.7 * fall;
					setWorld( kitchen, white, pos );

				} else white.visible = false;

				puddle.visible = k >= 0.52;
				setWorld( kitchen, puddle, land );
				puddle.scale.set( PUDDLE_RADIUS * spread + 0.001, PUDDLE_THICKNESS * Math.min( 1, spread * 2 ) + 0.001, PUDDLE_RADIUS * spread + 0.001 );

				// yolk: falls, lands on the white, wobbles like jelly
				setWorld( kitchen, yolk, pos.lerpVectors( eggPoint, yolkEnd, yolkFall * yolkFall ) );
				const t = clamp01( ( k - 0.5 ) / 0.5 );
				const wobble = Math.sin( t * Math.PI * 7 ) * Math.exp( - t * 3.5 ) * 0.2;
				yolk.scale.set( YOLK_RADIUS * ( 1 + wobble ), YOLK_RADIUS * 0.85 * ( 1 - wobble ), YOLK_RADIUS * ( 1 + wobble ) );

			},
			end: () => {

				kitchen.remove( shellTop, shellBottom, white );
				shellMaterial.dispose();
				shellGeometry.dispose();
				white.geometry.dispose();
				white.material.dispose();
				root.remove( crack );

			},
		},
	] );

}
