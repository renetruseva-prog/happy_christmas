// what's on one cookie: icing, and chocolate chips and sprinkles lying on it (or stuck in the icing).
//
// The icing is real stuff with a thickness: a grid of how deep it is at each point over the
// cookie's top. Icing that lands (see icing.js) piles up where it lands, then flows the way thick
// icing does: from where it's deep to where it's shallow, faster the deeper it is (a thin film
// hardly moves), and only while it's steep enough to overcome its own stiffness, so a piped line
// slumps a little into a soft rounded bead and then holds its shape. It stays on the cookie: it
// doesn't run over the edge. Where icings of different colours flow into each other, they mix.
// The grid is drawn as a surface just over the cookie's top, dipping under it where there's no icing.
//
// Everything is in the cookie's own coordinates: x and y across its top (see cutting/cuts.js), z up.
import * as THREE from 'three/webgpu';
import { attribute } from 'three/tsl';
import { contains, bounds } from '../cutting/outline.js';
import { addReflection } from '../reflections.js';
import { look } from './pieces.js';

const N = 64; // grid points along each side
const SINK = 0.0004; // the icing's surface is this far under the cookie's top where there's none
const EDGE = 0.0022; // how far in from the cookie's edge the icing stays (it's rounded there)
const STIFF = 0.45; // how steep icing can stand before it flows
const RUNNY = 420; // how readily it flows (more: runnier)
const MAX_DEPTH = 0.007;
const MAX_CHIPS = 40;
const MAX_SPRINKLES = 220;

let icingMaterial = null;

function material() {

	if ( ! icingMaterial ) {

		icingMaterial = new THREE.MeshPhysicalNodeMaterial( { vertexColors: true, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.22 } );
		icingMaterial.maskNode = attribute( 'inside', 'float' ).greaterThan( 0.5 );
		addReflection( icingMaterial, 0.6 );

	}

	return icingMaterial;

}

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

export class CookieDecor {

	constructor( { cookie, outline } ) {

		this.cookie = cookie;
		cookie.geometry.computeBoundingBox();
		this.top = cookie.geometry.boundingBox.max.z;

		// the cookie's shape in its own coordinates (as it was laid out when it was cut)
		const { c } = bounds( outline );
		this.shape = { outline, cx: c.x, cz: c.z };
		const box = cookie.geometry.boundingBox;
		this.extent = Math.max( box.max.x - box.min.x, box.max.y - box.min.y ) * 1.08;
		this.cell = this.extent / ( N - 1 );
		this.x0 = ( box.min.x + box.max.x ) / 2 - this.extent / 2; // the grid's first column
		this.y0 = ( box.min.y + box.max.y ) / 2 + this.extent / 2; // and first row (rows go down in y)

		// which grid points are on the cookie (a little way in from its edge)
		const count = N * N;
		this.on = new Uint8Array( count );
		for ( let i = 0; i < count; i ++ ) {

			const x = this.x0 + ( i % N ) * this.cell;
			const y = this.y0 - Math.floor( i / N ) * this.cell;
			this.on[ i ] = [ [ 0, 0 ], [ EDGE, 0 ], [ - EDGE, 0 ], [ 0, EDGE ], [ 0, - EDGE ] ].every( ( [ dx, dy ] ) => this.onCookie( x + dx, y + dy ) ) ? 1 : 0;

		}

		this.depth = new Float32Array( count );
		this.paint = new Float32Array( count * 3 ); // colour × depth (so mixing is just adding)
		this.flow = new Float32Array( count );
		this.flowPaint = new Float32Array( count * 3 );
		this.moving = false;
		this.lastWet = null;
		this.still = 0; // seconds it's been barely moving
		this.changed = false;

		// the surface
		const geometry = new THREE.PlaneGeometry( this.extent, this.extent, N - 1, N - 1 );
		geometry.translate( this.x0 + this.extent / 2, this.y0 - this.extent / 2, 0 );
		geometry.setAttribute( 'color', new THREE.BufferAttribute( new Float32Array( count * 3 ).fill( 1 ), 3 ) );
		const inside = new Float32Array( count );
		for ( let i = 0; i < count; i ++ ) inside[ i ] = this.on[ i ];
		geometry.setAttribute( 'inside', new THREE.BufferAttribute( inside, 1 ) );
		const flat = geometry.attributes.position.array;
		for ( let i = 0; i < count; i ++ ) flat[ i * 3 + 2 ] = this.top + ( this.on[ i ] ? - SINK : - 0.003 ); // (just under the top: no icing yet)
		this.icing = new THREE.Mesh( geometry, material() );
		this.icing.name = 'Icing';
		this.icing.receiveShadow = true;
		this.icing.frustumCulled = false;
		this.icing.visible = false;
		cookie.add( this.icing );

		// the chips and the sprinkles lying on it
		this.items = []; // { t: 'c' | 's', x, y, z (how high up: on the icing), a (turn), k (colour), r (tilt) }
		this.chips = new THREE.InstancedMesh( look.chipLying, look.chipMaterial, MAX_CHIPS );
		this.sprinkles = new THREE.InstancedMesh( look.sprinkle, look.sprinkleMaterial, MAX_SPRINKLES );
		this.sprinkles.instanceColor = new THREE.InstancedBufferAttribute( new Float32Array( MAX_SPRINKLES * 3 ), 3 );
		for ( const mesh of [ this.chips, this.sprinkles ] ) {

			mesh.count = 0;
			mesh.frustumCulled = false;
			mesh.castShadow = true;
			cookie.add( mesh );

		}

		this.changed = true;
		this.update();

	}

	// is (x, y) on the cookie at all
	onCookie( x, y ) {

		const { outline, cx, cz } = this.shape;
		return contains( outline, x + cx, cz - y );

	}

	// the grid point nearest (x, y), or -1 off the grid
	index( x, y ) {

		const col = Math.round( ( x - this.x0 ) / this.cell );
		const row = Math.round( ( this.y0 - y ) / this.cell );
		return col < 0 || row < 0 || col >= N || row >= N ? - 1 : row * N + col;

	}

	// how deep the icing is at (x, y)
	depthAt( x, y ) {

		const i = this.index( x, y );
		return i < 0 ? 0 : this.depth[ i ];

	}

	// whether something landing at (x, y) lands on the cookie (rather than over its edge)
	catches( x, y ) {

		return this.onCookie( x, y );

	}

	get decorated() {

		return this.items.length > 0 || this.depth.some( ( d ) => d > 0.0002 );

	}

	// ---------- icing ----------
	// a drop of icing lands at (x, y): `volume` of it, spread over about `radius`
	pour( x, y, volume, radius, color ) {

		const r = Math.max( radius / this.cell, 1.1 );
		const col0 = Math.round( ( x - this.x0 ) / this.cell );
		const row0 = Math.round( ( this.y0 - y ) / this.cell );
		const reach = Math.ceil( r * 1.8 );
		const spots = [];
		let total = 0;
		for ( let row = row0 - reach; row <= row0 + reach; row ++ ) {

			for ( let col = col0 - reach; col <= col0 + reach; col ++ ) {

				if ( row < 0 || col < 0 || row >= N || col >= N ) continue;
				const i = row * N + col;
				if ( ! this.on[ i ] ) continue;
				const dx = this.x0 + col * this.cell - x;
				const dy = this.y0 - row * this.cell - y;
				const w = Math.exp( - ( dx * dx + dy * dy ) / ( radius * radius * 0.6 ) );
				if ( w < 0.02 ) continue;
				spots.push( i, w );
				total += w;

			}

		}

		if ( total === 0 ) return;
		const area = this.cell * this.cell;
		for ( let n = 0; n < spots.length; n += 2 ) {

			const i = spots[ n ];
			const added = Math.min( volume * spots[ n + 1 ] / total / area, MAX_DEPTH - this.depth[ i ] );
			if ( added <= 0 ) continue;
			this.depth[ i ] += added;
			this.paint[ i * 3 ] += color.r * added;
			this.paint[ i * 3 + 1 ] += color.g * added;
			this.paint[ i * 3 + 2 ] += color.b * added;

		}

		this.moving = true;
		this.still = 0;
		this.changed = true;

	}

	// the part of the grid with icing on it (and a point round it, where it can flow to):
	// [ first row, last row, first column, last column ], or null if there's none
	wet() {

		let r0 = N;
		let r1 = - 1;
		let c0 = N;
		let c1 = - 1;
		const { depth } = this;
		for ( let i = 0; i < depth.length; i ++ ) {

			if ( depth[ i ] === 0 ) continue;
			const row = ( i / N ) | 0;
			const col = i - row * N;
			if ( row < r0 ) r0 = row;
			if ( row > r1 ) r1 = row;
			if ( col < c0 ) c0 = col;
			if ( col > c1 ) c1 = col;

		}

		return r1 < 0 ? null : [ Math.max( 0, r0 - 1 ), Math.min( N - 1, r1 + 1 ), Math.max( 0, c0 - 1 ), Math.min( N - 1, c1 + 1 ) ];

	}

	// the icing flowing, for dt seconds
	settle( dt ) {

		if ( ! this.moving ) return;
		const area = this.wet();
		if ( ! area ) {

			this.moving = false;
			return;

		}

		const [ r0, r1, c0, c1 ] = area;
		const { depth, paint, flow, flowPaint, on, cell } = this;
		let deepest = 0;
		for ( let row = r0; row <= r1; row ++ ) for ( let i = row * N + c0; i <= row * N + c1; i ++ ) if ( depth[ i ] > deepest ) deepest = depth[ i ];

		// short enough steps that it can't overshoot (deep icing flows fast)
		const quick = RUNNY * deepest ** 3;
		const steps = Math.min( 6, Math.max( 1, Math.ceil( dt / ( 0.2 * cell * cell / Math.max( quick, 1e-12 ) ) ) ) );
		const step = dt / steps;
		let moved = 0;

		// between point i and its neighbour j (each pair once)
		const between = ( i, j ) => {

			if ( ! on[ j ] ) return;
			const drop = depth[ i ] - depth[ j ];
			const slope = ( drop > 0 ? drop : - drop ) / cell;
			if ( slope <= STIFF ) return; // (stiff enough to hold its shape here)

			const from = drop > 0 ? i : j;
			const to = drop > 0 ? j : i;
			const mean = ( depth[ i ] + depth[ j ] ) / 2;
			const amount = Math.min( RUNNY * mean * mean * mean * ( slope - STIFF ) * step / cell, ( drop > 0 ? drop : - drop ) * 0.25 );
			if ( amount < 2e-8 ) return; // (too little to see: it's as good as stopped)
			const share = amount / depth[ from ];
			flow[ from ] -= amount;
			flow[ to ] += amount;
			for ( let k = 0; k < 3; k ++ ) {

				const p = paint[ from * 3 + k ] * share;
				flowPaint[ from * 3 + k ] -= p;
				flowPaint[ to * 3 + k ] += p;

			}

			moved += amount;

		};

		for ( let s = 0; s < steps; s ++ ) {

			for ( let row = r0; row <= r1; row ++ ) {

				for ( let i = row * N + c0; i <= row * N + c1; i ++ ) {

					if ( ! on[ i ] ) continue;
					if ( i - row * N < c1 ) between( i, i + 1 );
					if ( row < r1 ) between( i, i + N );

				}

			}

			for ( let row = r0; row <= r1; row ++ ) {

				for ( let i = row * N + c0; i <= row * N + c1; i ++ ) {

					if ( flow[ i ] === 0 ) continue;
					depth[ i ] = Math.max( 0, depth[ i ] + flow[ i ] );
					for ( let k = 0; k < 3; k ++ ) {

						paint[ i * 3 + k ] = Math.max( 0, paint[ i * 3 + k ] + flowPaint[ i * 3 + k ] );
						flowPaint[ i * 3 + k ] = 0;

					}

					flow[ i ] = 0;

				}

			}

		}

		this.changed = true;
		this.still = moved < 2e-6 ? this.still + dt : 0;
		if ( this.still > 0.4 ) this.moving = false; // (it's stopped: no need to keep working it out)

	}

	// the surface, where the icing is now (only the part that can have changed: where it's wet,
	// and where it was wet before)
	update() {

		if ( ! this.changed ) return;
		this.changed = false;

		const area = this.wet();
		const was = this.lastWet;
		this.lastWet = area;
		const any = area !== null;
		const box = area && was ? [ Math.min( area[ 0 ], was[ 0 ] ), Math.max( area[ 1 ], was[ 1 ] ), Math.min( area[ 2 ], was[ 2 ] ), Math.max( area[ 3 ], was[ 3 ] ) ] : area ?? was;

		if ( box ) {

			const geometry = this.icing.geometry;
			const position = geometry.attributes.position.array;
			const color = geometry.attributes.color.array;
			const normal = geometry.attributes.normal.array;
			const { depth, on, paint, top, cell } = this;
			const height = ( i ) => on[ i ] ? depth[ i ] - SINK : - 0.003;
			const [ r0, r1, c0, c1 ] = [ Math.max( 0, box[ 0 ] - 1 ), Math.min( N - 1, box[ 1 ] + 1 ), Math.max( 0, box[ 2 ] - 1 ), Math.min( N - 1, box[ 3 ] + 1 ) ];
			for ( let row = r0; row <= r1; row ++ ) {

				for ( let col = c0; col <= c1; col ++ ) {

					const i = row * N + col;
					const d = depth[ i ];
					position[ i * 3 + 2 ] = top + height( i );
					if ( d > 1e-6 ) for ( let k = 0; k < 3; k ++ ) color[ i * 3 + k ] = paint[ i * 3 + k ] / d;

					// which way the surface faces, from the heights on either side (rows go down in y)
					const dx = ( height( row * N + Math.min( N - 1, col + 1 ) ) - height( row * N + Math.max( 0, col - 1 ) ) ) / ( 2 * cell );
					const dy = ( height( Math.max( 0, row - 1 ) * N + col ) - height( Math.min( N - 1, row + 1 ) * N + col ) ) / ( 2 * cell );
					const length = Math.hypot( dx, dy, 1 );
					normal[ i * 3 ] = - dx / length;
					normal[ i * 3 + 1 ] = - dy / length;
					normal[ i * 3 + 2 ] = 1 / length;

				}

			}

			geometry.attributes.position.needsUpdate = true;
			geometry.attributes.color.needsUpdate = true;
			geometry.attributes.normal.needsUpdate = true;

		}

		this.icing.visible = any;

		// chips and sprinkles in the icing ride on it as it settles
		let rode = false;
		for ( const item of this.items ) {

			const z = this.depthAt( item.x, item.y );
			if ( Math.abs( z - item.z ) > 1e-5 ) {

				item.z = z;
				rode = true;

			}

		}

		if ( rode ) this.build();

	}

	// ---------- chips and sprinkles ----------
	// a chip ('c') or a sprinkle ('s') comes to rest at (x, y), `z` up (on the icing); false if there's no room
	place( t, x, y, z, a, k = 0 ) {

		const chips = this.items.filter( ( i ) => i.t === 'c' ).length;
		if ( t === 'c' ? chips >= MAX_CHIPS : this.items.length - chips >= MAX_SPRINKLES ) return false;
		this.items.push( { t, x, y, z, a, k, r: ( Math.random() - 0.5 ) * 0.4 } );
		this.build();
		return true;

	}

	build() {

		let chips = 0;
		let sprinkles = 0;
		for ( const { t, x, y, z, a, k, r } of this.items ) {

			if ( t === 'c' ) {

				// (sunk in a little, if it fell into icing)
				dummy.position.set( x, y, this.top + Math.max( 0, z - 0.0012 ) );
				dummy.rotation.set( r * 0.3, - r * 0.2, a );
				dummy.scale.setScalar( 1 );
				dummy.updateMatrix();
				this.chips.setMatrixAt( chips ++, dummy.matrix );

			} else {

				dummy.position.set( x, y, this.top + Math.max( 0, z - 0.0004 ) + look.sprinkleRadius );
				dummy.rotation.set( 0, 0, a );
				dummy.scale.setScalar( 1 );
				dummy.updateMatrix();
				this.sprinkles.setColorAt( sprinkles, tint.set( look.colors[ k % look.colors.length ] ) );
				this.sprinkles.setMatrixAt( sprinkles ++, dummy.matrix );

			}

		}

		this.chips.count = chips;
		this.sprinkles.count = sprinkles;
		this.chips.instanceMatrix.needsUpdate = true;
		this.sprinkles.instanceMatrix.needsUpdate = true;
		this.sprinkles.instanceColor.needsUpdate = true;

	}

	// rub off what's within `radius` of (x, y)
	wipe( x, y, radius ) {

		let changed = false;
		for ( let i = 0; i < this.depth.length; i ++ ) {

			if ( this.depth[ i ] === 0 ) continue;
			const dx = this.x0 + ( i % N ) * this.cell - x;
			const dy = this.y0 - Math.floor( i / N ) * this.cell - y;
			if ( dx * dx + dy * dy > radius * radius ) continue;
			this.depth[ i ] = 0;
			this.paint[ i * 3 ] = this.paint[ i * 3 + 1 ] = this.paint[ i * 3 + 2 ] = 0;
			changed = true;

		}

		if ( changed ) {

			this.changed = true;
			this.moving = true; // (the icing round the edge of the wiped bit slumps into it)

		}

		const before = this.items.length;
		this.items = this.items.filter( ( i ) => Math.hypot( i.x - x, i.y - y ) > radius );
		if ( this.items.length !== before ) this.build();

	}

	// ---------- saving ----------
	// the icing as bytes: how deep (0..255 for 0..MAX_DEPTH) and the colour, for each grid point
	toSaved() {

		let ice = null;
		if ( this.depth.some( ( d ) => d > 0.0001 ) ) {

			const bytes = new Uint8Array( this.depth.length * 4 );
			for ( let i = 0; i < this.depth.length; i ++ ) {

				const d = this.depth[ i ];
				bytes[ i * 4 ] = Math.round( d / MAX_DEPTH * 255 );
				for ( let k = 0; k < 3; k ++ ) bytes[ i * 4 + 1 + k ] = d > 0 ? Math.round( Math.min( 1, this.paint[ i * 3 + k ] / d ) * 255 ) : 0;

			}

			let text = '';
			for ( let i = 0; i < bytes.length; i += 4096 ) text += String.fromCharCode( ...bytes.subarray( i, i + 4096 ) );
			ice = btoa( text );

		}

		return { ice, items: this.items.map( ( i ) => [ i.t, + i.x.toFixed( 4 ), + i.y.toFixed( 4 ), + i.z.toFixed( 4 ), + i.a.toFixed( 2 ), i.k ] ) };

	}

	fromSaved( { ice, items } ) {

		this.items = ( Array.isArray( items ) ? items : [] ).filter( Array.isArray ).map( ( [ t, x, y, z, a, k ] ) => ( { t, x, y, z: z ?? 0, a: a ?? 0, k: k ?? 0, r: 0 } ) );
		this.build();
		if ( typeof ice !== 'string' ) return;

		try {

			const text = atob( ice );
			if ( text.length !== this.depth.length * 4 ) return; // (from a different version)
			for ( let i = 0; i < this.depth.length; i ++ ) {

				const d = text.charCodeAt( i * 4 ) / 255 * MAX_DEPTH;
				this.depth[ i ] = this.on[ i ] ? d : 0;
				for ( let k = 0; k < 3; k ++ ) this.paint[ i * 3 + k ] = text.charCodeAt( i * 4 + 1 + k ) / 255 * this.depth[ i ];

			}

			this.changed = true;
			this.update();

		} catch { /* broken: start this cookie bare */ }

	}

}
