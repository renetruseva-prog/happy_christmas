// the little things that fly: falling grains (flour powder, sugar crystals), puffs of flour dust,
// and the soft column of flour pouring from the bag
import * as THREE from 'three/webgpu';
import { ctx, bowl, surfaceY } from './contents.js';
import { materials } from './materials.js';

export const GRAVITY = 9.8;
const HIDDEN = new THREE.Matrix4().makeScale( 0, 0, 0 );

// filled in by initParticles()
export const particles = { flour: null, sugar: null, stream: null };

// ---------- falling grains ----------
class Grains {

	constructor( count, geometry, material, { drag = 0, onLand } ) {

		this.count = count;
		this.drag = drag;
		this.onLand = onLand; // returns true if the grain stays where it landed
		this.mesh = new THREE.InstancedMesh( geometry, material, count );
		this.mesh.frustumCulled = false;
		for ( let i = 0; i < count; i ++ ) this.mesh.setMatrixAt( i, HIDDEN );
		ctx.scene.add( this.mesh );

		this.pos = new Float32Array( count * 3 );
		this.vel = new Float32Array( count * 3 );
		this.size = new Float32Array( count );
		this.state = new Uint8Array( count ); // 0 unused, 1 falling, 2 resting
		this.rot = Array.from( { length: count }, () => new THREE.Quaternion().setFromEuler( new THREE.Euler( Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3 ) ) );
		this.next = 0;
		this.matrix = new THREE.Matrix4();
		this.p = new THREE.Vector3();
		this.s = new THREE.Vector3();

	}

	emit( position, velocity, size ) {

		const i = this.next;
		this.next = ( i + 1 ) % this.count; // reuse the oldest grain when the pool is full
		this.pos.set( [ position.x, position.y, position.z ], i * 3 );
		this.vel.set( [ velocity.x, velocity.y, velocity.z ], i * 3 );
		this.size[ i ] = size;
		this.state[ i ] = 1;

	}

	clear() {

		this.state.fill( 0 );
		for ( let i = 0; i < this.count; i ++ ) this.mesh.setMatrixAt( i, HIDDEN );
		this.mesh.instanceMatrix.needsUpdate = true;

	}

	update( dt ) {

		const { pos, vel } = this;
		const damp = Math.exp( - this.drag * dt );

		for ( let i = 0; i < this.count; i ++ ) {

			if ( this.state[ i ] === 0 ) {

				this.mesh.setMatrixAt( i, HIDDEN );
				continue;

			}

			if ( this.state[ i ] === 1 ) {

				const j = i * 3;
				vel[ j + 1 ] -= GRAVITY * dt;
				vel[ j ] *= damp;
				vel[ j + 2 ] *= damp;
				pos[ j ] += vel[ j ] * dt;
				pos[ j + 1 ] += vel[ j + 1 ] * dt;
				pos[ j + 2 ] += vel[ j + 2 ] * dt;

				// below the rim, the bowl's wall keeps grains inside
				if ( pos[ j + 1 ] < bowl.rimY ) {

					const dx = pos[ j ] - bowl.center.x;
					const dz = pos[ j + 2 ] - bowl.center.z;
					const d = Math.hypot( dx, dz );
					const max = bowl.radius * 0.95;
					if ( d > max ) {

						pos[ j ] = bowl.center.x + dx / d * max;
						pos[ j + 2 ] = bowl.center.z + dz / d * max;

					}

				}

				const ground = surfaceY( pos[ j ], pos[ j + 2 ] );
				if ( pos[ j + 1 ] - this.size[ i ] * 0.5 <= ground ) {

					const stays = this.onLand( pos[ j ], ground, pos[ j + 2 ] );
					pos[ j + 1 ] = ground + this.size[ i ] * 0.3;
					this.state[ i ] = stays ? 2 : 0;

				}

			}

			if ( this.state[ i ] === 0 ) {

				this.mesh.setMatrixAt( i, HIDDEN );
				continue;

			}

			this.p.fromArray( pos, i * 3 );
			this.s.setScalar( this.size[ i ] );
			this.mesh.setMatrixAt( i, this.matrix.compose( this.p, this.rot[ i ], this.s ) );

		}

		this.mesh.instanceMatrix.needsUpdate = true;

	}

}

// ---------- flour dust puffs ----------
const puffs = [];

function softDotTexture() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 64;
	const g = canvas.getContext( '2d' );
	const gradient = g.createRadialGradient( 32, 32, 0, 32, 32, 32 );
	gradient.addColorStop( 0, 'rgba(255,255,255,1)' );
	gradient.addColorStop( 1, 'rgba(255,255,255,0)' );
	g.fillStyle = gradient;
	g.fillRect( 0, 0, 64, 64 );
	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;

}

export function spawnPuff( x, y, z, { size = 0.02, grow = 0.06, rise = 0.04, alpha = 0.3 } = {} ) {

	const puff = puffs.find( ( p ) => ! p.sprite.visible );
	if ( ! puff ) return;
	puff.sprite.position.set( x + ( Math.random() - 0.5 ) * 0.02, y + 0.005, z + ( Math.random() - 0.5 ) * 0.02 );
	puff.sprite.visible = true;
	Object.assign( puff, { t: 0, life: 0.7 + Math.random() * 0.5, size, grow, rise, alpha } );

}

function updatePuffs( dt ) {

	for ( const puff of puffs ) {

		if ( ! puff.sprite.visible ) continue;
		puff.t += dt;
		const k = puff.t / puff.life;
		if ( k >= 1 ) {

			puff.sprite.visible = false;
			continue;

		}

		puff.sprite.scale.setScalar( puff.size + puff.grow * k );
		puff.sprite.position.y += puff.rise * dt;
		puff.sprite.material.opacity = puff.alpha * Math.sin( Math.PI * Math.min( 1, k * 1.5 ) ) * ( 1 - k );

	}

}

// ---------- setup and every frame ----------
export function initParticles() {

	particles.flour = new Grains( 3000, new THREE.IcosahedronGeometry( 1, 0 ), materials.flourGrain, {
		drag: 2.5,
		onLand: ( x, y, z ) => {

			if ( Math.random() < 0.04 ) spawnPuff( x, y, z );
			return false; // flour disappears into the heap

		},
	} );
	particles.sugar = new Grains( 1600, new THREE.BoxGeometry( 1, 1, 1 ), materials.sugarGrain, { onLand: () => true } );

	const dot = softDotTexture();
	for ( let i = 0; i < 60; i ++ ) {

		const sprite = new THREE.Sprite( new THREE.SpriteNodeMaterial( { map: dot, transparent: true, depthWrite: false, opacity: 0 } ) );
		sprite.visible = false;
		ctx.scene.add( sprite );
		puffs.push( { sprite, t: 0, life: 1 } );

	}

	// open cylinder, 1 unit tall, hanging down from its top: stretched from the bag's opening to the heap
	const streamGeometry = new THREE.CylinderGeometry( 0.6, 1.3, 1, 20, 8, true );
	streamGeometry.translate( 0, - 0.5, 0 );
	particles.stream = new THREE.Mesh( streamGeometry, materials.stream );
	particles.stream.visible = false;
	ctx.scene.add( particles.stream );

}

export function updateParticles( dt ) {

	particles.flour?.update( dt );
	particles.sugar?.update( dt );
	updatePuffs( dt );

}
