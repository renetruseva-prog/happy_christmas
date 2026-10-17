// what's left when something breaks on the table: bits (Rapier balls, see physics.js) fly out,
// bounce and settle as flat splodges and shards, and are wiped away a while later.
import * as THREE from 'three/webgpu';
import { addBall } from './physics.js';
import { TABLE_TOP } from './table.js';

const MAX = 120;
const LIFE = 1; // seconds a piece stays on the table once it has settled
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

let mesh = null;
let flying = []; // { ball, r, flat, color, age }
let settled = []; // { x, z, r, flat, color, yaw, since }

export function initDebris( scene ) {

	mesh = new THREE.InstancedMesh( new THREE.SphereGeometry( 1, 8, 6 ), new THREE.MeshStandardNodeMaterial( { roughness: 0.35 } ), MAX );
	mesh.instanceColor = new THREE.InstancedBufferAttribute( new Float32Array( MAX * 3 ), 3 );
	mesh.count = 0;
	mesh.frustumCulled = false;
	mesh.castShadow = true;
	scene.add( mesh );

}

// pieces: [ { color, count, size (radius, m), flat (how squashed when lying: 0.2 shards .. 1 round), speed } ]
export function burst( at, pieces ) {

	for ( const { color, count, size, flat = 0.4, speed = 1.2 } of pieces ) {

		for ( let i = 0; i < count && flying.length + settled.length < MAX; i ++ ) {

			const a = Math.random() * Math.PI * 2;
			const out = speed * ( 0.3 + Math.random() );
			const r = size * ( 0.6 + Math.random() * 0.8 );
			const velocity = new THREE.Vector3( Math.cos( a ) * out, 0.6 + Math.random() * 1.4, Math.sin( a ) * out );
			flying.push( { ball: addBall( at, r, velocity, { restitution: 0.35 } ), r, flat, color, age: 0 } );

		}

	}

}

export function updateDebris( dt, now = performance.now() / 1000 ) {

	if ( ! mesh ) return;

	const keep = [];
	for ( const f of flying ) {

		f.age += dt;
		const p = f.ball.body.translation();
		const v = f.ball.body.linvel();
		const rest = p.y < TABLE_TOP + f.r * 2 && Math.hypot( v.x, v.y, v.z ) < 0.1;
		if ( rest || ( f.age > 4 && p.y < TABLE_TOP + 0.1 ) ) {

			f.ball.remove();
			settled.push( { x: p.x, z: p.z, r: f.r, flat: f.flat, color: f.color, yaw: Math.random() * Math.PI, since: now } );

		} else if ( p.y < 0 || f.age > 8 ) f.ball.remove();
		else keep.push( f );

	}

	flying = keep;
	settled = settled.filter( ( s ) => now - s.since < LIFE );

	let n = 0;
	for ( const s of settled ) {

		dummy.position.set( s.x, TABLE_TOP + s.r * s.flat * 0.5, s.z );
		dummy.rotation.set( 0, s.yaw, 0 );
		dummy.scale.set( s.r * 1.5, s.r * s.flat, s.r * 1.5 );
		dummy.updateMatrix();
		mesh.setMatrixAt( n, dummy.matrix );
		mesh.setColorAt( n ++, tint.set( s.color ) );

	}

	for ( const f of flying ) {

		const p = f.ball.body.translation();
		dummy.position.set( p.x, p.y, p.z );
		dummy.rotation.set( f.age * 9, f.age * 7, 0 );
		dummy.scale.setScalar( f.r );
		dummy.updateMatrix();
		mesh.setMatrixAt( n, dummy.matrix );
		mesh.setColorAt( n ++, tint.set( f.color ) );

	}

	mesh.count = n;
	mesh.instanceMatrix.needsUpdate = true;
	mesh.instanceColor.needsUpdate = true;

}
