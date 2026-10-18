// cookie outlines: flat closed shapes on the table, as lists of { x, z } points (metres, in the
// kitchen's coordinates; the last point joins back up with the first)
import * as THREE from 'three/webgpu';

// the star cutters in the Blender file: five points, measured on the inside of the steel
const STAR = { outer: 0.052, inner: 0.024, firstTip: - 162 }; // firstTip: degrees, in the cutter's own coordinates

// the star a cutter cuts where it is now
export function starOutline( cutter ) {

	cutter.updateMatrixWorld( true );
	const points = [];
	for ( let i = 0; i < 10; i ++ ) {

		const a = THREE.MathUtils.degToRad( STAR.firstTip + 36 * i );
		const r = i % 2 === 0 ? STAR.outer : STAR.inner;
		const p = new THREE.Vector3( Math.cos( a ) * r, 0, Math.sin( a ) * r ).applyMatrix4( cutter.matrixWorld );
		points.push( { x: p.x, z: p.z } );

	}

	return points;

}

export function area( poly ) {

	let sum = 0;
	for ( let i = 0, j = poly.length - 1; i < poly.length; j = i ++ ) sum += poly[ j ].x * poly[ i ].z - poly[ i ].x * poly[ j ].z;
	return Math.abs( sum ) / 2;

}

export function contains( poly, x, z ) {

	let inside = false;
	for ( let i = 0, j = poly.length - 1; i < poly.length; j = i ++ ) {

		const a = poly[ i ];
		const b = poly[ j ];
		if ( ( a.z > z ) !== ( b.z > z ) && x < ( b.x - a.x ) * ( z - a.z ) / ( b.z - a.z ) + a.x ) inside = ! inside;

	}

	return inside;

}

function crosses( a, b, c, d ) {

	const side = ( p, q, r ) => ( q.x - p.x ) * ( r.z - p.z ) - ( q.z - p.z ) * ( r.x - p.x );
	return side( a, b, c ) * side( a, b, d ) < 0 && side( c, d, a ) * side( c, d, b ) < 0;

}

// whether the outline crosses over itself (it couldn't be cut out in one piece)
export function selfIntersects( poly ) {

	const n = poly.length;
	for ( let i = 0; i < n; i ++ ) {

		for ( let j = i + 2; j < n; j ++ ) {

			if ( i === 0 && j === n - 1 ) continue; // neighbours through the closing edge
			if ( crosses( poly[ i ], poly[ ( i + 1 ) % n ], poly[ j ], poly[ ( j + 1 ) % n ] ) ) return true;

		}

	}

	return false;

}

// points every `step` metres along a line (closed: back to the start too)
export function resample( points, step, closed = true ) {

	const path = closed ? [ ...points, points[ 0 ] ] : points;
	const out = [ { ...path[ 0 ] } ];
	let left = step;
	for ( let i = 1; i < path.length; i ++ ) {

		const a = path[ i - 1 ];
		const b = path[ i ];
		const length = Math.hypot( b.x - a.x, b.z - a.z );
		let at = 0;
		while ( length - at >= left ) {

			at += left;
			out.push( { x: a.x + ( b.x - a.x ) * at / length, z: a.z + ( b.z - a.z ) * at / length } );
			left = step;

		}

		left -= length - at;

	}

	if ( closed && out.length > 1 ) {

		const last = out[ out.length - 1 ];
		if ( Math.hypot( last.x - out[ 0 ].x, last.z - out[ 0 ].z ) < step * 0.5 ) out.pop();

	}

	return out;

}

// rounds off a shaky hand-drawn outline (Chaikin's corner cutting)
export function smooth( poly ) {

	const out = [];
	for ( let i = 0; i < poly.length; i ++ ) {

		const a = poly[ i ];
		const b = poly[ ( i + 1 ) % poly.length ];
		out.push( { x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 } );

	}

	return out;

}

// its middle and how far it reaches from there
export function bounds( poly ) {

	const c = poly.reduce( ( s, p ) => ( { x: s.x + p.x / poly.length, z: s.z + p.z / poly.length } ), { x: 0, z: 0 } );
	return { c, r: Math.max( ...poly.map( ( p ) => Math.hypot( p.x - c.x, p.z - c.z ) ) ) };

}

// whether two outlines stay at least `gap` apart (neither inside the other, no edges touching)
export function apart( a, b, gap ) {

	const ba = bounds( a );
	const bb = bounds( b );
	if ( Math.hypot( ba.c.x - bb.c.x, ba.c.z - bb.c.z ) > ba.r + bb.r + gap ) return true;

	const da = resample( a, 0.002 );
	const db = resample( b, 0.002 );
	if ( da.some( ( p ) => contains( b, p.x, p.z ) ) || db.some( ( p ) => contains( a, p.x, p.z ) ) ) return false;
	return da.every( ( p ) => db.every( ( q ) => Math.hypot( p.x - q.x, p.z - q.z ) >= gap ) );

}

// where two segments cross (null if they don't)
function crossingPoint( a, b, c, d ) {

	if ( ! crosses( a, b, c, d ) ) return null;
	const t = ( ( c.x - a.x ) * ( d.z - c.z ) - ( c.z - a.z ) * ( d.x - c.x ) ) / ( ( b.x - a.x ) * ( d.z - c.z ) - ( b.z - a.z ) * ( d.x - c.x ) );
	return { x: a.x + ( b.x - a.x ) * t, z: a.z + ( b.z - a.z ) * t };

}

// a sketch that crosses itself (the end overshooting the start, a little loop...) made into one
// that doesn't: at each crossing, the bigger of the two loops it makes is kept
export function untangle( poly ) {

	for ( let round = 0; round < 30; round ++ ) {

		const n = poly.length;
		let found = null;
		for ( let i = 0; i < n && ! found; i ++ ) {

			for ( let j = i + 2; j < n; j ++ ) {

				if ( i === 0 && j === n - 1 ) continue;
				const p = crossingPoint( poly[ i ], poly[ ( i + 1 ) % n ], poly[ j ], poly[ ( j + 1 ) % n ] );
				if ( p ) {

					found = { i, j, p };
					break;

				}

			}

		}

		if ( ! found ) return poly;
		const { i, j, p } = found;
		const inner = [ p, ...poly.slice( i + 1, j + 1 ) ];
		const outer = [ ...poly.slice( 0, i + 1 ), p, ...poly.slice( j + 1 ) ];
		poly = area( inner ) >= area( outer ) ? inner : outer;
		if ( poly.length < 3 ) return null;

	}

	return convexHull( poly ); // (a tangle that won't come undone: its outer edge)

}

// the shape's outer edge, without any dents
export function convexHull( poly ) {

	const pts = [ ...poly ].sort( ( a, b ) => a.x - b.x || a.z - b.z );
	const turn = ( o, a, b ) => ( a.x - o.x ) * ( b.z - o.z ) - ( a.z - o.z ) * ( b.x - o.x );
	const build = ( list ) => {

		const hull = [];
		for ( const p of list ) {

			while ( hull.length >= 2 && turn( hull[ hull.length - 2 ], hull[ hull.length - 1 ], p ) <= 0 ) hull.pop();
			hull.push( p );

		}

		hull.pop();
		return hull;

	};

	return [ ...build( pts ), ...build( pts.reverse() ) ];

}

// the outline scaled about its middle
export function scaled( poly, factor ) {

	const { c } = bounds( poly );
	return poly.map( ( p ) => ( { x: c.x + ( p.x - c.x ) * factor, z: c.z + ( p.z - c.z ) * factor } ) );

}
