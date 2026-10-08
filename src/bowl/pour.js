// pouring flour and sugar: the bag/jar is carried over the bowl and tipped, grains stream out of its
// opening and a heap grows in the bowl, then it's put back. The sugar jar's lid comes off first,
// and the sugar level in the jar goes down as it pours.
import * as THREE from 'three/webgpu';
import { animate, arcLerp, ease } from '../sequence.js';
import { ctx, bowl, surfaceY, Layer } from './contents.js';
import { materials } from './materials.js';
import { particles, spawnPuff, GRAVITY } from './particles.js';

const UP = new THREE.Vector3( 0, 1, 0 );

// where the sugar jar's lid is put down while pouring, relative to the jar's spot
const LID_REST_OFFSET = new THREE.Vector3( - 0.13, 0, 0.06 );

// how each container pours, and the heap it makes
const POURS = {
	Flour: { tilt: 2.0, pourHeight: 0.07, duration: 1.8, rate: 1800, speed: 0.15, spread: 0.025, size: [ 0.0012, 0.0026 ], radius: 0.1, height: 0.055, lumps: 0.25, clumps: 0.0025, dust: true, grains: () => particles.flour, mound: () => materials.flour },
	Sugar: { tilt: 1.95, pourHeight: 0.06, duration: 1.6, rate: 700, speed: 0.3, spread: 0.04, size: [ 0.0018, 0.003 ], radius: 0.035, height: 0.02, lumps: 0.15, clumps: 0.0008, grains: () => particles.sugar, mound: () => materials.sugar },
};

const containers = new Map(); // bag/jar → where its opening is, its lid and the sugar inside

// ---------- setup ----------
function rootOf( name ) {

	let obj = ctx.room.getObjectByName( name );
	while ( obj && obj.parent && obj.parent !== ctx.room ) obj = obj.parent;
	return obj;

}

// bounding box of everything in `obj`, measured in `frame`'s own coordinates
function boxIn( frame, obj = frame ) {

	frame.updateMatrixWorld( true );
	const toFrame = frame.matrixWorld.clone().invert();
	const box = new THREE.Box3();
	obj.traverse( ( o ) => {

		if ( ! o.isMesh ) return;
		o.geometry.computeBoundingBox();
		box.union( o.geometry.boundingBox.clone().applyMatrix4( new THREE.Matrix4().multiplyMatrices( toFrame, o.matrixWorld ) ) );

	} );
	return box;

}

function setupContainer( name, { lid, contents } = {} ) {

	const root = rootOf( name );
	if ( ! root ) return;

	const box = boxIn( root );
	const info = {
		spout: new THREE.Vector3( ( box.min.x + box.max.x ) / 2, box.max.y, ( box.min.z + box.max.z ) / 2 ),
		mouth: Math.min( box.max.x - box.min.x, box.max.z - box.min.z ) / 2,
		tableY: new THREE.Box3().setFromObject( root ).min.y,
	};

	// the lid and the sugar inside are separate objects in Blender: make them travel with the jar
	const lidObj = lid && ctx.room.getObjectByName( lid );
	if ( lidObj ) {

		if ( lidObj.parent !== root ) root.attach( lidObj );
		info.lid = lidObj;
		info.lidLocal = { position: lidObj.position.clone(), quaternion: lidObj.quaternion.clone() };
		info.lidHalfHeight = ( boxIn( lidObj ).max.y - boxIn( lidObj ).min.y ) / 2;

	}

	const contentsObj = contents && ctx.room.getObjectByName( contents );
	if ( contentsObj ) {

		if ( contentsObj.parent !== root ) root.attach( contentsObj );
		const cb = boxIn( root, contentsObj );
		info.contents = contentsObj;
		info.contentsBase = { y: contentsObj.position.y, scaleY: contentsObj.scale.y, half: ( cb.max.y - cb.min.y ) / 2 };

	}

	containers.set( root, info );

}

export function setupContainers() {

	setupContainer( 'Flour_Bag' );
	setupContainer( 'Sugar_Jar', { lid: 'Sugar_Jar_Lid', contents: 'Sugar_Jar_Contents' } );

}

// the sugar left in the jar: 1 = full
function fillJar( info, left ) {

	if ( ! info?.contents ) return;
	const { y, scaleY, half } = info.contentsBase;
	info.contents.scale.y = scaleY * left;
	info.contents.position.y = y - half * ( 1 - left );

}

function addHeap( pour, x, z ) {

	return new Layer( { x, z, radius: pour.radius, height: pour.height, lumps: pour.lumps, clumps: pour.clumps, material: pour.mound() } );

}

// ---------- pouring ----------
// flour bag / sugar jar: tip it over the bowl, pour, put it back
export async function pourIntoBowl( root ) {

	const pour = POURS[ root.userData.ingredient ];
	const info = containers.get( root );
	const home = root.userData.home;
	const start = root.position.clone();
	const startQ = root.quaternion.clone();

	// tip it towards the bowl, from the side where it normally stands
	const toBowl = new THREE.Vector3().subVectors( bowl.center, home.position ).setY( 0 ).normalize();
	const axis = new THREE.Vector3().crossVectors( UP, toBowl ).normalize();
	const tipped = new THREE.Quaternion().setFromAxisAngle( axis, pour.tilt ).multiply( home.quaternion );

	// hold it so that, fully tipped, its opening is just above the middle of the bowl
	const spoutTarget = bowl.center.clone().addScaledVector( toBowl, - 0.02 );
	spoutTarget.y = bowl.rimY + pour.pourHeight;
	const pivot = spoutTarget.clone().sub( info.spout.clone().multiply( root.scale ).applyQuaternion( tipped ) );

	// 1. carry it over, upright
	await animate( 0.5, ( k ) => {

		arcLerp( root.position, start, pivot, ease( k ), 0.05 );
		root.quaternion.slerpQuaternions( startQ, home.quaternion, ease( k ) );

	} );

	if ( info.lid ) await liftLid( info, home );

	// 2. tip it
	await animate( 0.55, ( k ) => root.quaternion.slerpQuaternions( home.quaternion, tipped, ease( k ) ) );

	// 3. pour: grains stream out of the opening while the heap grows in the bowl
	const heap = addHeap( pour, bowl.center.x + ( Math.random() - 0.5 ) * 0.03, bowl.center.z + ( Math.random() - 0.5 ) * 0.03 );
	const grains = pour.grains();
	const lip = new THREE.Vector3();
	const out = new THREE.Vector3();
	const vel = new THREE.Vector3();
	let carry = 0;

	await animate( pour.duration, ( k, dt ) => {

		// a little shake so it doesn't pour perfectly evenly
		const shake = Math.sin( k * 40 ) * 0.04 * ( 1 - k );
		root.quaternion.setFromAxisAngle( axis, pour.tilt + shake ).multiply( home.quaternion );
		root.updateMatrixWorld();
		lip.copy( info.spout ).applyMatrix4( root.matrixWorld );
		out.copy( UP ).applyQuaternion( root.quaternion ); // the way the opening faces

		carry += pour.rate * dt * ( k < 0.85 ? 1 : ( 1 - k ) / 0.15 );
		while ( carry >= 1 ) {

			carry --;
			const r = Math.sqrt( Math.random() ) * info.mouth * 0.6;
			const a = Math.random() * Math.PI * 2;
			const p = lip.clone().add( new THREE.Vector3( Math.cos( a ) * r, 0, Math.sin( a ) * r ) );
			vel.copy( out ).multiplyScalar( pour.speed ).add( new THREE.Vector3( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).multiplyScalar( pour.spread ) );
			grains.emit( p, vel, THREE.MathUtils.lerp( pour.size[ 0 ], pour.size[ 1 ], Math.random() ) );

		}

		if ( pour.dust ) pourFlourStream( lip, k, pour.duration );

		// the heap starts once the first grains arrive
		heap.setGrowth( ease( THREE.MathUtils.clamp( ( k * pour.duration - 0.2 ) / ( pour.duration - 0.2 ), 0, 1 ) ) );
		fillJar( info, 1 - 0.75 * k ); // the jar empties

	} );

	particles.stream.visible = false;

	// 4. tip it back and put it back where it was
	await animate( 0.45, ( k ) => root.quaternion.slerpQuaternions( tipped, home.quaternion, ease( k ) ) );
	const from = root.position.clone();
	await animate( 0.55, ( k ) => arcLerp( root.position, from, home.position, ease( k ), 0.05 ) );

	if ( info.lid ) await replaceLid( info, root );

}

// flour: a soft falling column from the opening down to the heap, which reaches down at the start
// and thins out at the end, with a faint cloud of dust around it
function pourFlourStream( lip, k, duration ) {

	const ground = surfaceY( lip.x, lip.z );
	const t = k * duration;
	const flow = k < 0.85 ? 1 : ( 1 - k ) / 0.15;
	const width = 0.01 * flow;
	const stream = particles.stream;
	stream.visible = width > 0.0005;
	stream.position.copy( lip );
	stream.scale.set( width, Math.min( lip.y - ground, 0.5 * GRAVITY * t * t + 0.01 ), width );

	if ( Math.random() < 0.7 ) spawnPuff( lip.x, THREE.MathUtils.lerp( lip.y, ground, Math.random() ), lip.z, { size: 0.015, grow: 0.035, rise: 0.015, alpha: 0.35 } );

}

async function liftLid( info, home ) {

	const lid = info.lid;
	ctx.room.attach( lid ); // stays on the table while the jar pours
	const from = lid.position.clone();
	const to = home.position.clone().add( LID_REST_OFFSET );
	to.y = info.tableY + info.lidHalfHeight;
	await animate( 0.4, ( k ) => arcLerp( lid.position, from, to, ease( k ), 0.06 ) );

}

async function replaceLid( info, root ) {

	const lid = info.lid;
	root.updateMatrixWorld( true );
	const from = lid.position.clone();
	const to = root.localToWorld( info.lidLocal.position.clone() );
	await animate( 0.4, ( k ) => arcLerp( lid.position, from, to, ease( k ), 0.06 ) );
	root.attach( lid );
	lid.position.copy( info.lidLocal.position );
	lid.quaternion.copy( info.lidLocal.quaternion );

}

// poured before a page refresh: the finished heap, and the jar mostly empty
export function restorePour( root ) {

	addHeap( POURS[ root.userData.ingredient ], bowl.center.x, bowl.center.z ).setGrowth( 1 );
	fillJar( containers.get( root ), 0.25 );

}
