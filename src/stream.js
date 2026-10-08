// the grains that fall from a spout into the bowl, and the dust that flour throws up
import * as THREE from 'three/webgpu';
import { fillColor } from './bowl.js';

// flour: a soft, wide ribbon of fine specks that air slows down, with dust puffs where it lands.
// sugar: a narrow, steady stream of crystals that fall freely, tumble and bounce on the pile.
const STREAMS = {
	Flour: { count: 700, perSecond: 900, size: 0.0028, stretch: 4, box: false, spread: 0.02, sideways: 0.035, gravity: 5, drag: 2.2, bounce: 0, puffs: true },
	Sugar: { count: 500, perSecond: 450, size: 0.0032, stretch: 1, box: true, spread: 0.005, sideways: 0.01, gravity: 9, drag: 0, bounce: 0.25, puffs: false },
};

const PUFF_COUNT = 40;
const PUFF_LIFE = 1.2;

export function createStream( parent, kind ) {

	const spec = STREAMS[ kind ];
	const geometry = spec.box ? new THREE.BoxGeometry( spec.size, spec.size, spec.size ) : new THREE.SphereGeometry( spec.size, 5, 5 );
	const material = new THREE.MeshStandardNodeMaterial( { color: fillColor( kind ), roughness: spec.box ? 0.25 : 1 } );
	const mesh = new THREE.InstancedMesh( geometry, material, spec.count );
	mesh.frustumCulled = false;
	parent.add( mesh );

	const grains = Array.from( { length: spec.count }, () => ( {
		alive: false,
		bounced: false,
		size: 1,
		pos: new THREE.Vector3(),
		vel: new THREE.Vector3(),
		quat: new THREE.Quaternion(),
	} ) );

	const matrix = new THREE.Matrix4();
	const scale = new THREE.Vector3();
	const local = new THREE.Vector3();
	const spin = new THREE.Quaternion();
	const hidden = new THREE.Matrix4().makeScale( 0, 0, 0 );
	const lastLand = new THREE.Vector3();
	let haveLanded = false;
	let spawnDebt = 0;

	// dust puffs: big, faint balls that billow up where the flour hits
	let puffMesh = null;
	const puffs = [];
	let puffTimer = 0;
	if ( spec.puffs ) {

		puffMesh = new THREE.InstancedMesh(
			new THREE.SphereGeometry( 1, 10, 8 ),
			new THREE.MeshStandardNodeMaterial( { color: fillColor( kind ), roughness: 1, transparent: true, opacity: 0.16, depthWrite: false } ),
			PUFF_COUNT,
		);
		puffMesh.frustumCulled = false;
		parent.add( puffMesh );
		for ( let i = 0; i < PUFF_COUNT; i ++ ) puffs.push( { age: - 1, pos: new THREE.Vector3(), size: 0 } );

	}

	return {
		emitting: false,

		// spout and landY are in world space (landY is the top of the heap right now)
		update( dt, spout, landY ) {

			if ( this.emitting ) spawnDebt += spec.perSecond * dt;

			grains.forEach( ( g, i ) => {

				if ( ! g.alive && spawnDebt >= 1 ) {

					spawnDebt --;
					g.alive = true;
					g.bounced = false;
					g.size = 0.7 + Math.random() * 0.6;
					g.pos.set( spout.x + ( Math.random() - 0.5 ) * spec.spread, spout.y, spout.z + ( Math.random() - 0.5 ) * spec.spread );
					g.vel.set( - 0.1 - Math.random() * 0.06, - 0.05, ( Math.random() - 0.5 ) * spec.sideways );
					g.quat.setFromEuler( new THREE.Euler( Math.random() * 6, Math.random() * 6, Math.random() * 6 ) );

				}

				if ( g.alive ) {

					g.vel.y -= spec.gravity * dt;
					if ( spec.drag ) g.vel.multiplyScalar( Math.max( 0, 1 - spec.drag * dt ) );
					g.pos.addScaledVector( g.vel, dt );
					if ( spec.box ) g.quat.multiply( spin.setFromEuler( new THREE.Euler( dt * 12, dt * 9, 0 ) ) );

					if ( g.pos.y < landY ) {

						if ( spec.bounce && ! g.bounced ) {

							// a crystal hops off the pile once and skitters sideways
							g.bounced = true;
							g.pos.y = landY;
							g.vel.set( ( Math.random() - 0.5 ) * 0.08, - g.vel.y * spec.bounce, ( Math.random() - 0.5 ) * 0.08 );

						} else {

							g.alive = false;
							lastLand.set( g.pos.x, landY, g.pos.z );
							haveLanded = true;

						}

					}

				}

				if ( g.alive ) {

					// flour specks are drawn as short vertical streaks so the stream reads as a ribbon
					scale.set( g.size, g.size * spec.stretch, g.size );
					mesh.setMatrixAt( i, matrix.compose( parent.worldToLocal( local.copy( g.pos ) ), spec.box ? g.quat : spin.identity(), scale ) );

				} else mesh.setMatrixAt( i, hidden );

			} );

			mesh.instanceMatrix.needsUpdate = true;
			if ( puffMesh ) this.updatePuffs( dt );

		},

		updatePuffs( dt ) {

			puffTimer += dt;
			if ( this.emitting && haveLanded && puffTimer > 1 / 30 ) {

				puffTimer = 0;
				const puff = puffs.find( ( p ) => p.age < 0 );
				if ( puff ) {

					puff.age = 0;
					puff.size = 0.012 + Math.random() * 0.012;
					puff.pos.set( lastLand.x + ( Math.random() - 0.5 ) * 0.03, lastLand.y, lastLand.z + ( Math.random() - 0.5 ) * 0.03 );

				}

			}

			puffs.forEach( ( p, i ) => {

				if ( p.age >= 0 ) {

					p.age += dt;
					if ( p.age > PUFF_LIFE ) p.age = - 1;

				}

				if ( p.age < 0 ) {

					puffMesh.setMatrixAt( i, hidden );
					return;

				}

				// puffs swell and drift upwards, then thin away
				const life = p.age / PUFF_LIFE;
				const fade = life < 0.25 ? life / 0.25 : 1 - ( life - 0.25 ) / 0.75;
				const s = p.size * ( 1 + life * 3 ) * Math.max( fade, 0.001 );
				local.set( p.pos.x, p.pos.y + life * 0.05, p.pos.z );
				puffMesh.setMatrixAt( i, matrix.compose( parent.worldToLocal( local ), spin.identity(), scale.setScalar( s ) ) );

			} );

			puffMesh.instanceMatrix.needsUpdate = true;

		},

		dispose() {

			parent.remove( mesh );
			mesh.geometry.dispose();
			mesh.material.dispose();
			if ( puffMesh ) {

				parent.remove( puffMesh );
				puffMesh.geometry.dispose();
				puffMesh.material.dispose();

			}

		},
	};

}
