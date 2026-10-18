// chocolate chips and sprinkles poured from their bowls: each one falls (gravity, a little air),
// tumbling, and bounces off whatever it hits until it settles. On bare cookie it bounces and rolls
// a little before it stops; in icing it sticks where it lands; whatever misses the cookies ends up
// on the baking paper (and stays there, unless it's wiped off).
// They look like the ones in the bowls on the table: the chips are the model's own chips, the
// sprinkles have the colours of the model's sprinkles.
import * as THREE from 'three/webgpu';
import { addReflection } from '../world/reflections.js';

const GRAVITY = 9.81;
const AIR = 0.6; // how much the air slows them
const BOUNCE = 0.32; // how much of its speed a piece keeps bouncing up off something hard
const RUB = 0.55; // and along it
const MAX_FALLING = { c: 80, s: 500 };

// what the chips and sprinkles look like (filled in from the kitchen model by initLook)
export const look = {
	chipFalling: null, // a chip, up the right way in the world (y up)
	chipLying: null, // the same, standing on a cookie (its z up: see cookieDecor.js)
	chipHalf: 0.003, // half its height
	chipMaterial: null,
	sprinkle: null, // a sprinkle: a short rod along x
	sprinkleRadius: 0.0008,
	sprinkleMaterial: null,
	colors: [ '#7cbcff', '#89e795', '#ffbc59', '#ffa0cb', '#ed5050', '#f9f7f3', '#ffea6c' ],
};

export function initLook( room ) {

	// a chip from the model (the ones lying next to the bowl), made a bit smaller for a cookie
	const model = room.getObjectByName( 'Chocolate_Chip_Spilled_0' );
	const chip = model ? model.geometry.clone() : new THREE.ConeGeometry( 0.006, 0.007, 8 );
	chip.center();
	chip.scale( 0.62, 0.62, 0.62 );
	chip.computeBoundingBox();
	chip.translate( 0, - chip.boundingBox.min.y, 0 ); // (its bottom at 0)
	chip.computeVertexNormals();
	look.chipHalf = ( chip.boundingBox.max.y - chip.boundingBox.min.y ) / 2;
	chip.translate( 0, - look.chipHalf, 0 ); // (falling: turning round its middle)
	look.chipFalling = chip;
	look.chipLying = chip.clone().translate( 0, look.chipHalf, 0 ).rotateX( Math.PI / 2 );
	look.chipMaterial = model?.material ?? new THREE.MeshStandardNodeMaterial( { color: 0x613f27, roughness: 0.4 } );

	// the sprinkles: the size of the model's, in its colours
	const colors = [];
	room.getObjectByName( 'Sprinkles_Bowl' )?.traverse( ( o ) => {

		if ( o.isMesh && o.material.name.startsWith( 'M_Sprinkle_' ) && o.name !== 'Sprinkles_Bowl_Fill' ) colors.push( `#${ o.material.color.getHexString() }` );

	} );
	if ( colors.length ) look.colors = colors;
	look.sprinkle = new THREE.CapsuleGeometry( look.sprinkleRadius, 0.0062, 3, 8 ).rotateZ( Math.PI / 2 );
	look.sprinkleMaterial = new THREE.MeshStandardNodeMaterial( { color: 0xffffff, roughness: 0.4 } );
	addReflection( look.sprinkleMaterial, 0.5 );

}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const spin = new THREE.Quaternion();
const axis = new THREE.Vector3();
const UP = new THREE.Vector3( 0, 1, 0 );

// ---------- falling ----------
export class Falling {

	constructor( scene ) {

		this.pieces = [];
		this.chips = new THREE.InstancedMesh( look.chipFalling, look.chipMaterial, MAX_FALLING.c );
		this.sprinkles = new THREE.InstancedMesh( look.sprinkle, look.sprinkleMaterial, MAX_FALLING.s );
		this.sprinkles.instanceColor = new THREE.InstancedBufferAttribute( new Float32Array( MAX_FALLING.s * 3 ), 3 );
		for ( const mesh of [ this.chips, this.sprinkles ] ) {

			mesh.count = 0;
			mesh.frustumCulled = false;
			mesh.castShadow = true;
			scene.add( mesh );

		}

	}

	// t: 'c' (a chip) or 's' (a sprinkle), at `at`, going at `velocity`
	spawn( t, at, velocity ) {

		if ( this.pieces.filter( ( p ) => p.t === t ).length >= MAX_FALLING[ t ] ) return;
		const q = new THREE.Quaternion();
		if ( t === 's' ) q.setFromEuler( new THREE.Euler( Math.random() * 6, Math.random() * 6, Math.random() * 6 ) );
		else q.setFromAxisAngle( UP, Math.random() * Math.PI * 2 );
		this.pieces.push( {
			t,
			at: at.clone(),
			v: velocity.clone(),
			q,
			w: new THREE.Vector3( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).multiplyScalar( t === 's' ? 30 : 8 ),
			k: Math.floor( Math.random() * look.colors.length ),
			bounces: 0,
			age: 0,
		} );

	}

	// ground( at ): what's under `at`: { y (its height), decor (the cookie, or null), x, y2 (on it),
	// depth (icing there) } (see decorating/index.js); bounds: the tray's inside, a Box3;
	// rest( piece, ground ): a piece has come to rest
	update( dt, { ground, bounds, rest } ) {

		const still = [];
		for ( const p of this.pieces ) {

			p.age += dt;
			p.v.y -= GRAVITY * dt;
			p.v.multiplyScalar( 1 - AIR * dt );
			p.at.addScaledVector( p.v, dt );
			const turn = p.w.length();
			if ( turn > 0 ) p.q.premultiply( spin.setFromAxisAngle( axis.copy( p.w ).divideScalar( turn ), turn * dt ) );

			// the sides of the tray
			for ( const [ c, min, max ] of [ [ 'x', bounds.min.x, bounds.max.x ], [ 'z', bounds.min.z, bounds.max.z ] ] ) {

				if ( p.at[ c ] < min || p.at[ c ] > max ) {

					p.at[ c ] = THREE.MathUtils.clamp( p.at[ c ], min, max );
					p.v[ c ] *= - BOUNCE;

				}

			}

			const half = p.t === 'c' ? look.chipHalf : look.sprinkleRadius;
			const under = ground( p.at );
			if ( p.at.y - half > under.y ) {

				if ( p.age < 6 ) still.push( p );
				continue;

			}

			// it's hit something: sticks in icing, settles if it's slow, otherwise bounces
			const sticky = under.decor && under.depth > 0.0004;
			if ( sticky || Math.abs( p.v.y ) < 0.28 || p.bounces >= 3 ) {

				p.at.y = under.y + half;
				rest( p, under );
				continue;

			}

			p.at.y = under.y + half;
			p.v.y *= - BOUNCE;
			p.v.x *= RUB;
			p.v.z *= RUB;
			p.w.multiplyScalar( 0.5 );
			p.bounces ++;
			still.push( p );

		}

		this.pieces = still;
		this.draw();

	}

	draw() {

		let chips = 0;
		let sprinkles = 0;
		for ( const p of this.pieces ) {

			dummy.position.copy( p.at );
			dummy.quaternion.copy( p.q );
			dummy.updateMatrix();
			if ( p.t === 'c' ) this.chips.setMatrixAt( chips ++, dummy.matrix );
			else {

				this.sprinkles.setColorAt( sprinkles, tint.set( look.colors[ p.k ] ) );
				this.sprinkles.setMatrixAt( sprinkles ++, dummy.matrix );

			}

		}

		this.chips.count = chips;
		this.sprinkles.count = sprinkles;
		this.chips.instanceMatrix.needsUpdate = true;
		this.sprinkles.instanceMatrix.needsUpdate = true;
		this.sprinkles.instanceColor.needsUpdate = true;

	}

	get busy() {

		return this.pieces.length > 0;

	}

}

// ---------- what missed the cookies: on the baking paper ----------
const MAX_SPILLED = { c: 80, s: 400, i: 300 };

export class Spills {

	// tray: the baking tray's mesh (they're kept on it, so they'd go with it)
	constructor( tray, icingMaterial ) {

		this.tray = tray;
		this.items = []; // { t: 'c' | 's' | 'i' (a drop of icing), x, y, z (on the tray), a, k, s (a drop's size), color }
		this.chips = new THREE.InstancedMesh( look.chipLying, look.chipMaterial, MAX_SPILLED.c );
		this.sprinkles = new THREE.InstancedMesh( look.sprinkle, look.sprinkleMaterial, MAX_SPILLED.s );
		this.drops = new THREE.InstancedMesh( new THREE.SphereGeometry( 1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2 ), icingMaterial, MAX_SPILLED.i );
		this.sprinkles.instanceColor = new THREE.InstancedBufferAttribute( new Float32Array( MAX_SPILLED.s * 3 ), 3 );
		this.drops.instanceColor = new THREE.InstancedBufferAttribute( new Float32Array( MAX_SPILLED.i * 3 ), 3 );
		for ( const mesh of [ this.chips, this.sprinkles, this.drops ] ) {

			mesh.count = 0;
			mesh.frustumCulled = false;
			tray.add( mesh );

		}

		this.chips.castShadow = true;

		// which way is up, in the tray's own coordinates
		tray.updateMatrixWorld( true );
		this.up = tray.worldToLocal( tray.getWorldPosition( new THREE.Vector3() ).add( UP ) ).normalize();
		this.lying = new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 0, 1 ), this.up ); // (a cookie's z up: see look.chipLying)

	}

	// t lands at `at` (in the world)
	add( t, at, { a = Math.random() * Math.PI * 2, k = 0, size = 0, color = null } = {} ) {

		const local = this.tray.worldToLocal( at.clone() );
		if ( t === 'i' ) {

			// a drop of icing: it joins one that's already there
			const near = this.items.find( ( i ) => i.t === 'i' && Math.hypot( i.x - local.x, i.y - local.y, i.z - local.z ) < i.s * 0.8 );
			if ( near ) {

				near.s = Math.cbrt( near.s ** 3 + size ** 3 );
				this.build();
				return;

			}

		}

		if ( this.items.filter( ( i ) => i.t === t ).length >= MAX_SPILLED[ t ] ) return;
		this.items.push( { t, x: local.x, y: local.y, z: local.z, a, k, s: size, color } );
		this.build();

	}

	build() {

		const counts = { c: 0, s: 0, i: 0 };
		for ( const { t, x, y, z, a, k, s, color } of this.items ) {

			dummy.position.set( x, y, z );
			dummy.quaternion.setFromAxisAngle( this.up, a ).multiply( this.lying );
			dummy.scale.setScalar( 1 );
			if ( t === 's' ) dummy.position.addScaledVector( this.up, look.sprinkleRadius );
			if ( t === 'i' ) {

				// a flattened dome
				dummy.quaternion.setFromUnitVectors( UP, this.up );
				dummy.scale.set( s * 1.5, s * 0.55, s * 1.5 );

			}

			dummy.updateMatrix();
			const mesh = { c: this.chips, s: this.sprinkles, i: this.drops }[ t ];
			if ( t === 's' ) mesh.setColorAt( counts.s, tint.set( look.colors[ k % look.colors.length ] ) );
			if ( t === 'i' ) mesh.setColorAt( counts.i, tint.set( color ?? '#ffffff' ) );
			mesh.setMatrixAt( counts[ t ] ++, dummy.matrix );

		}

		for ( const [ t, mesh ] of [ [ 'c', this.chips ], [ 's', this.sprinkles ], [ 'i', this.drops ] ] ) {

			mesh.count = counts[ t ];
			mesh.instanceMatrix.needsUpdate = true;
			if ( mesh.instanceColor ) mesh.instanceColor.needsUpdate = true;

		}

	}

	// rub off what's within `radius` of `at` (in the world)
	wipe( at, radius ) {

		const local = this.tray.worldToLocal( at.clone() );
		const before = this.items.length;
		this.items = this.items.filter( ( i ) => Math.hypot( i.x - local.x, i.y - local.y, i.z - local.z ) > radius + ( i.s || 0 ) );
		if ( this.items.length !== before ) this.build();

	}

	toSaved() {

		return this.items.map( ( i ) => [ i.t, + i.x.toFixed( 4 ), + i.y.toFixed( 4 ), + i.z.toFixed( 4 ), + i.a.toFixed( 2 ), i.k, + ( i.s || 0 ).toFixed( 4 ), i.color ] );

	}

	fromSaved( list ) {

		this.items = ( Array.isArray( list ) ? list : [] ).filter( Array.isArray ).map( ( [ t, x, y, z, a, k, s, color ] ) => ( { t, x, y, z, a, k, s, color } ) );
		this.build();

	}

}
