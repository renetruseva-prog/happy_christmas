// the inside of the mixing bowl and what builds up in it: heaps of flour and sugar, egg white,
// the dough. Also where things can lie in it (so yolks and the butter don't land on each other).
import * as THREE from 'three/webgpu';

// what the bowl's code works with (set up by initContents)
export const ctx = { scene: null, camera: null, room: null, bowlMesh: null };

// the inside of the bowl, treated as a half sphere hanging under its rim
export const bowl = { center: new THREE.Vector3(), rimY: 0, radius: 0 };

export const layers = []; // the heaps, in the order they went in
export const solids = []; // the yolks and the butter: they disappear into the dough when it's mixed
const taken = []; // where yolks and the butter lie, so the next one lands somewhere free

export function initContents( { scene, camera, room, bowlMesh } ) {

	Object.assign( ctx, { scene, camera, room, bowlMesh } );
	room.updateMatrixWorld( true );

	const box = new THREE.Box3().setFromObject( bowlMesh );
	box.getCenter( bowl.center );
	bowl.rimY = box.max.y;
	bowl.center.y = bowl.rimY;
	bowl.radius = ( box.max.x - box.min.x ) / 2 * 0.94; // inside of the wall (the bowl's wall is 6% of its radius)

}

// the inside of the bowl: middle of the opening, rim height, inside radius
export function bowlInfo() {

	return { center: bowl.center.clone(), rimY: bowl.rimY, radius: bowl.radius };

}

export function isOverBowl( raycaster ) {

	return ctx.bowlMesh !== null && raycaster.intersectObject( ctx.bowlMesh, true ).length > 0;

}

// height of whatever is in the bowl at (x, z): the bowl's inside, or the highest heap there
export function surfaceY( x, z ) {

	const dx = x - bowl.center.x;
	const dz = z - bowl.center.z;
	let y = bowl.rimY - Math.sqrt( Math.max( bowl.radius * bowl.radius - dx * dx - dz * dz, 0 ) );
	for ( const layer of layers ) y = Math.max( y, layer.domeAt( x, z ) );
	return y;

}

// the spot in the bowl (within `reach` of the middle, or on that circle when `ring` is set)
// furthest from everything already lying there. It's then taken (`size` big)
export function claimSpot( reach, size, { ring = false } = {} ) {

	let best = { x: bowl.center.x, z: bowl.center.z };
	let bestRoom = - Infinity;
	for ( let i = 0; i < 24; i ++ ) {

		const a = i / 24 * Math.PI * 2 + Math.random() * 0.2;
		const r = ring ? reach : i === 0 ? 0 : reach * ( 0.5 + 0.5 * ( i % 2 ) );
		const x = bowl.center.x + Math.cos( a ) * r;
		const z = bowl.center.z + Math.sin( a ) * r;
		const room = taken.reduce( ( m, t ) => Math.min( m, Math.hypot( x - t.x, z - t.z ) - t.size ), 1 );
		if ( room > bestRoom ) {

			bestRoom = room;
			best = { x, z };

		}

	}

	taken.push( { ...best, size } );
	return best;

}

// one heap in the bowl (flour, sugar, egg white, the dough). Like real powder it piles up from
// where it lands into a lumpy dome; where the dome is lower than what is already there (the
// bowl's wall, an earlier heap) it stays hidden underneath. It grows from nothing (growth 0) to
// full (1). bottom: where it starts from (default: whatever is under its peak)
export class Layer {

	constructor( { x, z, radius, height, material, lumps = 0.12, clumps = 0, bottom = null } ) {

		this.x = x;
		this.z = z;
		this.radius = radius; // how far the dome spreads on a flat surface
		this.height = height;
		this.lumps = lumps;
		this.clumps = clumps;
		this.seed = Math.random() * 100;
		this.growth = 0;
		this.bottom = bottom ?? surfaceY( x, z ); // what it lands on, under its peak
		this.steepness = height / ( radius * radius );

		// the mesh covers the whole bowl; only the part above the earlier surface shows
		const rings = 18;
		const segs = 56;
		this.rings = rings;
		this.segs = segs;
		const reach = bowl.radius + Math.hypot( x - bowl.center.x, z - bowl.center.z );
		const count = 1 + rings * segs;
		const position = new Float32Array( count * 3 );
		this.base = new Float32Array( count ); // the surface under each vertex before this heap

		let i = 0;
		const put = ( d, phi ) => {

			let px = x + Math.cos( phi ) * d;
			let pz = z + Math.sin( phi ) * d;

			// stay inside the bowl
			const dx = px - bowl.center.x;
			const dz = pz - bowl.center.z;
			const dist = Math.hypot( dx, dz );
			const max = bowl.radius * 0.985;
			if ( dist > max ) {

				px = bowl.center.x + dx / dist * max;
				pz = bowl.center.z + dz / dist * max;

			}

			position[ i * 3 ] = px;
			position[ i * 3 + 2 ] = pz;
			this.base[ i ] = surfaceY( px, pz );
			i ++;

		};

		put( 0, 0 );
		for ( let r = 1; r <= rings; r ++ ) {

			const d = reach * ( r / rings ) ** 1.4; // denser rings near the peak
			for ( let s = 0; s < segs; s ++ ) put( d, s / segs * Math.PI * 2 );

		}

		const index = [];
		for ( let s = 0; s < segs; s ++ ) index.push( 0, 1 + ( s + 1 ) % segs, 1 + s );
		for ( let r = 2; r <= rings; r ++ ) {

			for ( let s = 0; s < segs; s ++ ) {

				const a = 1 + ( r - 2 ) * segs + s;
				const a2 = 1 + ( r - 2 ) * segs + ( s + 1 ) % segs;
				const b = a + segs;
				const b2 = a2 + segs;
				index.push( a, b2, b, a, a2, b2 );

			}

		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', new THREE.BufferAttribute( position, 3 ) );
		geometry.setAttribute( 'color', new THREE.BufferAttribute( new Float32Array( count * 3 ).fill( 1 ), 3 ) );
		geometry.setIndex( index );
		// where each point started (x, z): the pattern on the surface stays with it as it's moved about
		const flow = new Float32Array( count * 2 );
		for ( let n = 0; n < count; n ++ ) {

			flow[ n * 2 ] = position[ n * 3 ];
			flow[ n * 2 + 1 ] = position[ n * 3 + 2 ];

		}

		geometry.setAttribute( 'flow', new THREE.BufferAttribute( flow, 2 ) );

		this.mesh = new THREE.Mesh( geometry, material );
		this.mesh.receiveShadow = true;
		ctx.scene.add( this.mesh );

		// what doesn't change as the heap grows is worked out once: where each point is in the
		// dome's outline, and its small clumps (so growing it is just arithmetic)
		this.d2 = new Float32Array( count );
		this.outline = new Float32Array( count ); // the lumpy outline: how much the dome falls off at this point
		this.small = new Float32Array( count ); // the small clumps on the surface
		for ( let n = 0; n < count; n ++ ) {

			const px = position[ n * 3 ];
			const pz = position[ n * 3 + 2 ];
			const dx = px - x;
			const dz = pz - z;
			this.d2[ n ] = dx * dx + dz * dz;
			const phi = Math.atan2( dz, dx );
			const u = Math.min( Math.sqrt( this.d2[ n ] ) / radius, 1 );
			this.outline[ n ] = 1 + lumps * u * ( 0.6 * Math.sin( 3 * phi + this.seed ) + 0.4 * Math.sin( 7 * phi + this.seed * 2 ) );
			this.small[ n ] = clumps * ( Math.sin( px * 310 + this.seed ) * Math.sin( pz * 290 - this.seed ) + 0.5 * Math.sin( ( px + pz ) * 520 + this.seed * 3 ) );

		}

		this.rest = new Float32Array( count ); // the height of each point, before anything moves it
		this.above = new Float32Array( count ); // how far it is above what's under it (under 0: hidden)
		this.body = null; // something that moves the surface about (see doughBody.js)

		layers.push( this );
		this.built = false;
		this.setGrowth( 0 );

	}

	// height of the dome at (x, z): a rounded peak that falls off with distance, with a lumpy outline
	domeAt( x, z ) {

		const dx = x - this.x;
		const dz = z - this.z;
		const d2 = dx * dx + dz * dz;
		const phi = Math.atan2( dz, dx );
		const u = Math.min( Math.sqrt( d2 ) / this.radius, 1 );
		const wobble = 1 + this.lumps * u * ( 0.6 * Math.sin( 3 * phi + this.seed ) + 0.4 * Math.sin( 7 * phi + this.seed * 2 ) );
		// small clumps on the surface, so the light picks out its shape
		const clumps = this.clumps * ( Math.sin( x * 310 + this.seed ) * Math.sin( z * 290 - this.seed ) + 0.5 * Math.sin( ( x + z ) * 520 + this.seed * 3 ) );
		return this.bottom + this.growth * ( this.height + clumps ) - this.steepness * d2 * wobble;

	}

	setGrowth( g ) {

		if ( this.built && Math.abs( g - this.growth ) < 0.0005 ) return; // (nothing to change)
		this.growth = g;
		this.built = true;
		this.mesh.visible = g > 0.001;
		if ( ! this.mesh.visible && this.shown === false ) return; // (and nothing to show)
		this.shown = this.mesh.visible;

		const { color: shade } = this.mesh.geometry.attributes;
		const color = shade.array;
		const { bottom, height, steepness, d2, outline, small, base, rest } = this;
		for ( let i = 0; i < shade.count; i ++ ) {

			// on top of the dome where it's higher, tucked just under the earlier surface where it isn't
			const dome = bottom + g * ( height + small[ i ] ) - steepness * d2[ i ] * outline[ i ];
			const above = dome - base[ i ];
			this.above[ i ] = above;
			rest[ i ] = above > 0 ? dome + 0.0005 : base[ i ] - 0.004;

			// a little darker where the heap meets what's under it, so its outline reads
			const s = 0.7 + 0.3 * Math.min( Math.max( above / 0.008, 0 ), 1 );
			color[ i * 3 ] = color[ i * 3 + 1 ] = color[ i * 3 + 2 ] = s;

		}

		shade.needsUpdate = true;
		this.write();

	}

	// puts the surface where it is now: at rest, or moved about by its body
	write() {

		const { position, flow } = this.mesh.geometry.attributes;
		if ( this.body ) {

			this.body.apply( position.array, flow.array );
			flow.needsUpdate = true;

		} else for ( let i = 0; i < position.count; i ++ ) position.array[ i * 3 + 1 ] = this.rest[ i ];
		position.needsUpdate = true;
		this.mesh.geometry.computeVertexNormals();

	}

}
