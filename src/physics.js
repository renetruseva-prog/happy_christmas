// the physics world (Rapier): the table, the bowl and the floor are fixed, and anything handed to
// addBody() falls, bounces and tumbles on them. The scripted animations (tween.js, sequence.js)
// stay as they are: an object is only handed over for as long as it should be loose (see
// ingredients.js, where a dropped ingredient tumbles on the table), then taken back with
// body.remove() and animated again.
//   addBody( object, options )  → { body, sleeping, remove() }
//   stepPhysics( dt )           → call once a frame with the capped dt: steps at a fixed 60 Hz
//                                 and copies each body's pose onto its object
import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';

const STEP = 1 / 60;
const MAX_STEPS = 4; // (a slow frame doesn't try to catch up for ever)

let world = null;
let accumulator = 0;
const bodies = []; // { object, body, handle }

const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const parentQuat = new THREE.Quaternion();

export async function initPhysics( room ) {

	await RAPIER.init();
	world = new RAPIER.World( { x: 0, y: - 9.81, z: 0 } );
	room.updateMatrixWorld( true );

	// the floor, in case something falls off the table
	world.createCollider( RAPIER.ColliderDesc.cuboid( 5, 0.5, 5 ).setTranslation( 0, - 0.5, 0 ) );

	// the table top: its box (the model's top is a flat slab)
	const table = room.getObjectByName( 'Table_Top_Baked' );
	if ( table ) {

		const box = new THREE.Box3().setFromObject( table );
		const c = box.getCenter( new THREE.Vector3() );
		const s = box.getSize( new THREE.Vector3() );
		world.createCollider( RAPIER.ColliderDesc.cuboid( s.x / 2, s.y / 2, s.z / 2 ).setTranslation( c.x, c.y, c.z ).setFriction( 0.7 ) );

		// invisible walls round the table's edge, so nothing loose goes over it (flung dough, a dropped
		// ingredient): it stays on the table
		const wall = 0.02;
		const high = 0.4;
		for ( const [ sx, sz ] of [ [ - 1, 0 ], [ 1, 0 ], [ 0, - 1 ], [ 0, 1 ] ] ) {

			const alongX = sz !== 0; // (a wall on the front or back runs along x)
			world.createCollider( RAPIER.ColliderDesc.cuboid( alongX ? s.x / 2 + wall : wall, high / 2, alongX ? wall : s.z / 2 + wall )
				.setTranslation( c.x + sx * ( s.x / 2 + wall ), box.max.y + high / 2, c.z + sz * ( s.z / 2 + wall ) ) );

		}

	}

	// the bowl: its own shape, so things can rest against or in it
	const bowl = room.getObjectByName( 'Mixing_Bowl' );
	if ( bowl ) addStaticMesh( bowl );

}

// a fixed collider with the shape of a mesh (and its children)
export function addStaticMesh( object ) {

	object.updateMatrixWorld( true );
	object.traverse( ( o ) => {

		if ( ! o.isMesh || ! o.geometry.index ) return;
		const position = o.geometry.attributes.position;
		const vertices = new Float32Array( position.count * 3 );
		for ( let i = 0; i < position.count; i ++ ) {

			tmpPos.fromBufferAttribute( position, i ).applyMatrix4( o.matrixWorld );
			vertices.set( [ tmpPos.x, tmpPos.y, tmpPos.z ], i * 3 );

		}

		world.createCollider( RAPIER.ColliderDesc.trimesh( vertices, new Uint32Array( o.geometry.index.array ) ).setFriction( 0.6 ) );

	} );

}

// object starts to fall: a box the size of what it fills now (its box in the world), pivoting on
// its own origin. options: velocity (Vector3), spin (Vector3, rad/s), restitution, friction, density
export function addBody( object, { velocity = null, spin = null, restitution = 0.25, friction = 0.6, density = 400 } = {} ) {

	object.updateMatrixWorld( true );
	const box = new THREE.Box3().setFromObject( object );
	const size = box.getSize( new THREE.Vector3() );
	const center = box.getCenter( new THREE.Vector3() );
	object.matrixWorld.decompose( tmpPos, tmpQuat, new THREE.Vector3() );

	const body = world.createRigidBody( RAPIER.RigidBodyDesc.dynamic()
		.setTranslation( tmpPos.x, tmpPos.y, tmpPos.z )
		.setRotation( tmpQuat )
		.setLinearDamping( 0.1 )
		.setAngularDamping( 0.6 )
		.setCcdEnabled( true ) );

	// the box is kept lined up with the world, where it was measured, whatever the object's turn
	const offset = center.clone().sub( tmpPos ).applyQuaternion( tmpQuat.clone().invert() );
	const turn = tmpQuat.clone().invert();
	world.createCollider( RAPIER.ColliderDesc.cuboid( size.x / 2, size.y / 2, size.z / 2 )
		.setTranslation( offset.x, offset.y, offset.z )
		.setRotation( turn )
		.setRestitution( restitution )
		.setFriction( friction )
		.setDensity( density ), body );

	if ( velocity ) body.setLinvel( velocity, true );
	if ( spin ) body.setAngvel( spin, true );

	const entry = { object, body };
	bodies.push( entry );

	return {
		body,
		get sleeping() {

			return body.isSleeping();

		},
		remove() {

			const i = bodies.indexOf( entry );
			if ( i < 0 ) return;
			bodies.splice( i, 1 );
			world.removeRigidBody( body );

		},
	};

}

// a ball (radius r) thrown from `at` with `velocity`, no mesh attached: read its position with
// ball.body.translation() (spatter, crumbs...). Returns { body, remove() }
export function addBall( at, radius, velocity, { restitution = 0.2, friction = 0.9, density = 1000 } = {} ) {

	const body = world.createRigidBody( RAPIER.RigidBodyDesc.dynamic()
		.setTranslation( at.x, at.y, at.z )
		.setLinvel( velocity.x, velocity.y, velocity.z )
		.setLinearDamping( 0.2 )
		.setAngularDamping( 2 )
		.setCcdEnabled( true ) );
	world.createCollider( RAPIER.ColliderDesc.ball( radius ).setRestitution( restitution ).setFriction( friction ).setDensity( density ), body );
	return {
		body,
		remove() {

			if ( world.getRigidBody( body.handle ) ) world.removeRigidBody( body );

		},
	};

}

export function stepPhysics( dt ) {

	if ( ! world ) return;

	accumulator = Math.min( accumulator + dt, STEP * MAX_STEPS );
	while ( accumulator >= STEP ) {

		world.timestep = STEP;
		world.step();
		accumulator -= STEP;

	}

	for ( const { object, body } of bodies ) {

		const p = body.translation();
		const q = body.rotation();
		const parent = object.parent;
		tmpPos.set( p.x, p.y, p.z );
		tmpQuat.set( q.x, q.y, q.z, q.w );
		if ( parent ) {

			parent.worldToLocal( tmpPos );
			parent.getWorldQuaternion( parentQuat ).invert();
			tmpQuat.premultiply( parentQuat );

		}

		object.position.copy( tmpPos );
		object.quaternion.copy( tmpQuat );

	}

}
