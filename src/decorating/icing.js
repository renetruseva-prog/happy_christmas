// the icing coming out of the piping bag: squeezed out of the nozzle as a soft rope, which falls
// (pushed out, then pulled down by gravity, and carried along by the bag's own movement, so it
// trails behind when the bag moves) and stretches thinner as it falls faster, the way a thread of
// icing does (the same amount of icing, spread over a longer stretch). Where it lands it goes on
// the cookie (see cookieDecor.js), or onto the baking paper if it misses.
// It's drawn as a chain of little balls joined by tubes.
import * as THREE from 'three/webgpu';
import { addReflection } from '../world/reflections.js';

const GRAVITY = 9.81;
const PUSH = 0.24; // how fast it comes out of the nozzle (metres per second)
const SPACING = 0.75; // a bit of icing every SPACING × its radius of rope, as it comes out
const LANDS = 0.22; // how much of it actually lands as icing (the rest is how thick the rope looks)
const MAX = 700;

const up = new THREE.Vector3( 0, 1, 0 );
const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const between = new THREE.Vector3();

export class IcingStream {

	constructor( scene ) {

		this.material = new THREE.MeshPhysicalNodeMaterial( { color: 0xffffff, roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.25 } );
		addReflection( this.material, 0.6 );
		this.balls = new THREE.InstancedMesh( new THREE.SphereGeometry( 1, 12, 8 ), this.material, MAX );
		this.tubes = new THREE.InstancedMesh( new THREE.CylinderGeometry( 1, 1, 1, 10, 1, true ), this.material, MAX );
		for ( const mesh of [ this.balls, this.tubes ] ) {

			mesh.instanceColor = new THREE.InstancedBufferAttribute( new Float32Array( MAX * 3 ), 3 );
			mesh.count = 0;
			mesh.frustumCulled = false;
			mesh.castShadow = true;
			scene.add( mesh );

		}

		this.bits = []; // { at, v, r, color, rope (which squeeze it's from), gap (how far it was from the one before, coming out) }
		this.owed = 0; // how much rope is due to come out (in bits)
		this.rope = 0;
		this.lastTip = null;
		this.lastAim = null;

	}

	// squeeze for dt seconds: tip (where the nozzle is), out (the way it points), moving (the bag's
	// velocity), radius (how thick the rope is), color (a THREE.Color)
	// aim: the spot on the cookie (or the paper) the mouse points at. Each bit is sent so that it
	// lands right there, however fast the bag moves: the icing goes where you point
	squeeze( dt, { tip, out, moving, aim, radius, color } ) {

		const from = this.lastTip ?? tip;
		const aimFrom = this.lastAim ?? aim;
		this.owed += dt * PUSH / ( radius * SPACING );
		const count = Math.floor( this.owed );
		this.owed -= count;

		for ( let n = 0; n < count && this.bits.length < MAX; n ++ ) {

			// spread out along the way the tip went this frame, each a little way out already
			const k = ( n + 1 ) / count;
			const age = dt * ( 1 - k );
			const v = out.clone().multiplyScalar( PUSH );
			const at = from.clone().lerp( tip, k ).addScaledVector( v, age );
			v.y -= GRAVITY * age;

			// where the mouse was when this bit came out, and the time it takes to fall there
			const spot = aimFrom.clone().lerp( aim, k );
			const drop = Math.max( at.y - spot.y, 0.002 );
			const fall = ( - v.y + Math.sqrt( v.y * v.y + 2 * GRAVITY * drop ) ) / GRAVITY;
			v.x = ( spot.x - at.x ) / fall;
			v.z = ( spot.z - at.z ) / fall;
			this.bits.push( { at, v, r: radius, color: color.clone(), rope: this.rope, gap: radius * SPACING } );

		}

		this.lastTip = tip.clone();
		this.lastAim = aim.clone();

	}

	// let go: the next squeeze is a new rope
	stop() {

		if ( this.lastTip === null ) return;
		this.lastTip = null;
		this.lastAim = null;
		this.owed = 0;
		this.rope ++;

	}

	// ground( at ): what's under `at` (see decorating/index.js); land( bit, ground, volume ): it's landed
	update( dt, { ground, land } ) {

		const left = [];
		for ( const bit of this.bits ) {

			bit.v.y -= GRAVITY * dt;
			bit.at.addScaledVector( bit.v, dt );
			const under = ground( bit.at );
			if ( bit.at.y - bit.r * 0.5 > under.y ) {

				left.push( bit );
				continue;

			}

			land( bit, under, LANDS * 4 / 3 * Math.PI * bit.r ** 3 );

		}

		this.bits = left;
		this.draw();

	}

	draw() {

		const { bits } = this;
		let balls = 0;
		let tubes = 0;

		for ( let i = 0; i < bits.length; i ++ ) {

			const bit = bits[ i ];
			const next = bits[ i + 1 ];

			// the rope gets thinner where it's stretched out (there's only so much icing in it)
			let r = bit.r;
			if ( next && next.rope === bit.rope ) {

				const length = between.subVectors( next.at, bit.at ).length();
				const thin = bit.r * Math.min( 1, Math.sqrt( bit.gap / Math.max( length, 1e-6 ) ) );
				r = Math.min( r, thin * 1.05 );

				if ( length < bit.r * 12 ) {

					dummy.position.copy( bit.at ).addScaledVector( between, 0.5 );
					dummy.quaternion.setFromUnitVectors( up, between.divideScalar( Math.max( length, 1e-6 ) ) );
					dummy.scale.set( thin, length, thin );
					dummy.updateMatrix();
					this.tubes.setMatrixAt( tubes, dummy.matrix );
					this.tubes.setColorAt( tubes ++, tint.copy( bit.color ) );

				}

			}

			dummy.position.copy( bit.at );
			dummy.quaternion.identity();
			dummy.scale.setScalar( r );
			dummy.updateMatrix();
			this.balls.setMatrixAt( balls, dummy.matrix );
			this.balls.setColorAt( balls ++, tint.copy( bit.color ) );

		}

		this.balls.count = balls;
		this.tubes.count = tubes;
		for ( const mesh of [ this.balls, this.tubes ] ) {

			mesh.instanceMatrix.needsUpdate = true;
			mesh.instanceColor.needsUpdate = true;

		}

	}

	get busy() {

		return this.bits.length > 0;

	}

}
