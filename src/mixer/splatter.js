// the dough flies: the spinning beaters fling little blobs of dough out of the bowl (Rapier balls,
// see physics.js). The ones that fall back in vanish into the dough; the ones that clear the rim
// bounce off the bowl and the table and stay there as splodges, until there are too many and the
// oldest are wiped away.
import * as THREE from 'three/webgpu';
import { addBall } from '../physics.js';
import { TABLE_TOP } from '../table.js';
import { bowlInfo, contentsTop } from '../bowl/index.js';
import { getState } from '../state.js';

const MAX_FLYING = 40;
const MAX_STUCK = 40;
const CALM = 1.5; // going round slower than this (radians per second) flings nothing
const WILD = 8; // and this fast is as wild as it gets
const RATE = [ 0.8, 11 ]; // blobs per second, from just over calm to wild
let vigour = 0; // how hard it's being stirred now (0..1), eased so a jittery mouse doesn't flicker
const dummy = new THREE.Object3D();

let flying = []; // { ball, radius, age }
let stuck = []; // { x, z, radius }
let mesh = null;
let timer = 0;
let tableBox = null; // the table top, in the world
let dragged = null; // the blob being dragged with the mouse (one of `stuck`)
const LIFT = 0.025; // how high a dragged blob is held above the table
const GRAB = 0.018; // how close (metres) the mouse has to be to a blob to take it

export function initSplatter( scene ) {

	const material = new THREE.MeshStandardNodeMaterial( { color: 0xdcb87e, roughness: 0.8 } );
	mesh = new THREE.InstancedMesh( new THREE.SphereGeometry( 1, 10, 8 ), material, MAX_FLYING + MAX_STUCK );
	mesh.count = 0;
	mesh.frustumCulled = false;
	mesh.castShadow = true;
	scene.add( mesh );

	const table = scene.getObjectByName( 'Table_Top_Baked' );
	if ( table ) {

		table.updateMatrixWorld( true );
		tableBox = new THREE.Box3().setFromObject( table );

	}

}

// the dough that flew out can be picked up with the mouse and dragged: let go of it over the
// table and it stays there, let go of it outside the table and it's gone
const plane = new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), - TABLE_TOP );
const ray = new THREE.Raycaster();
const hit = new THREE.Vector3();

export function initDragging( { camera, controls } ) {

	const pointAt = ( e ) => {

		ray.setFromCamera( new THREE.Vector2( e.clientX / window.innerWidth * 2 - 1, - e.clientY / window.innerHeight * 2 + 1 ), camera );
		return ray.ray.intersectPlane( plane, hit ) !== null;

	};

	// (in the capture phase, before the camera controls get the press)
	window.addEventListener( 'pointerdown', ( e ) => {

		const { busy, mixing, rolling, held } = getState();
		if ( e.button !== 0 || busy || mixing || rolling || held || ! stuck.length || e.target !== controls.domElement ) return;
		if ( ! pointAt( e ) ) return;
		let best = null;
		let nearest = Infinity;
		for ( const b of stuck ) {

			const d = Math.hypot( b.x - hit.x, b.z - hit.z ) - b.radius;
			if ( d < GRAB && d < nearest ) {

				nearest = d;
				best = b;

			}

		}

		if ( ! best ) return;
		dragged = best;
		controls.enabled = false;
		e.stopImmediatePropagation();

	}, true );

	window.addEventListener( 'pointermove', ( e ) => {

		if ( ! dragged || ! pointAt( e ) ) return;
		dragged.x = hit.x;
		dragged.z = hit.z;

	} );

	const drop = () => {

		if ( ! dragged ) return;
		const { x, z } = dragged;
		const off = tableBox && ( x < tableBox.min.x || x > tableBox.max.x || z < tableBox.min.z || z > tableBox.max.z );
		if ( off ) stuck = stuck.filter( ( b ) => b !== dragged );
		dragged = null;
		controls.enabled = true;

	};

	window.addEventListener( 'pointerup', drop );
	window.addEventListener( 'blur', drop );

}

// every frame. spin: how fast the beaters spin (0..1); beaters: [ { x, z } ] where they are;
// on: the mixer is held over the bowl, with the dough thick enough to fling. orbit: how fast it
// goes round the bowl (rad/s): the faster and more aggressively, the more and the further it flings
export function updateSplatter( dt, { on, spin, beaters, orbit = 0 } ) {

	const { center, rimY, radius } = bowlInfo();

	const target = on ? THREE.MathUtils.clamp( ( Math.abs( orbit ) - CALM ) / ( WILD - CALM ), 0, 1 ) : 0;
	vigour += ( target - vigour ) * ( 1 - Math.exp( - dt * 6 ) );
	if ( on && beaters.length && spin > 0.5 && vigour > 0.02 && flying.length < MAX_FLYING ) {

		timer += dt * THREE.MathUtils.lerp( RATE[ 0 ], RATE[ 1 ], vigour ) * spin;
		while ( timer >= 1 ) {

			timer -= 1;
			const b = beaters[ Math.floor( Math.random() * beaters.length ) ];
			const out = new THREE.Vector3( b.x - center.x, 0, b.z - center.z );
			if ( out.lengthSq() < 1e-6 ) out.set( Math.random() - 0.5, 0, Math.random() - 0.5 );
			out.normalize();
			const side = new THREE.Vector3( - out.z, 0, out.x ).multiplyScalar( Math.sign( orbit ) || 1 );
			const r = 0.004 + Math.random() * 0.005;
			const at = new THREE.Vector3( b.x, contentsTop( b.x, b.z ) + 0.012, b.z );
			const force = 0.35 + 0.95 * vigour; // (a gentle stir lobs them barely over the edge, a wild one throws them)
			const velocity = out.multiplyScalar( ( 0.3 + Math.random() * 0.9 ) * force ).addScaledVector( side, ( 0.4 + Math.random() * 0.4 ) * force );
			velocity.y = ( 1.2 + Math.random() * 1.3 ) * force;
			flying.push( { ball: addBall( at, r, velocity ), radius: r, age: 0 } );

		}

	}

	const keep = [];
	for ( const f of flying ) {

		f.age += dt;
		const p = f.ball.body.translation();
		const v = f.ball.body.linvel();
		const inside = Math.hypot( p.x - center.x, p.z - center.z ) < radius;
		const gone = inside && p.y < contentsTop( p.x, p.z ) + f.radius && f.age > 0.1 && v.y < 0; // (back in the dough)
		const onTable = ! inside && p.y < TABLE_TOP + f.radius * 1.5 && Math.hypot( v.x, v.y, v.z ) < 0.08;
		const lost = p.y < 0 || f.age > 6;

		if ( gone || lost ) f.ball.remove();
		else if ( onTable ) {

			f.ball.remove();
			stuck.push( { x: p.x, z: p.z, radius: f.radius } );
			if ( stuck.length > MAX_STUCK ) stuck.shift();

		} else keep.push( f );

	}

	flying = keep;
	draw();

}

function draw() {

	let n = 0;
	for ( const s of stuck ) {

		dummy.position.set( s.x, TABLE_TOP + s.radius * 0.3 + ( s === dragged ? LIFT : 0 ), s.z );
		dummy.scale.set( s.radius * 1.4, s.radius * 0.6, s.radius * 1.4 ); // (squashed flat)
		dummy.quaternion.identity();
		dummy.updateMatrix();
		mesh.setMatrixAt( n ++, dummy.matrix );

	}

	for ( const f of flying ) {

		const p = f.ball.body.translation();
		dummy.position.set( p.x, p.y, p.z );
		dummy.scale.setScalar( f.radius );
		dummy.quaternion.identity();
		dummy.updateMatrix();
		mesh.setMatrixAt( n ++, dummy.matrix );

	}

	mesh.count = n;
	mesh.instanceMatrix.needsUpdate = true;

}
