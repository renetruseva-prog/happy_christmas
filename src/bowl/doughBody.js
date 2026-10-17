// the dough's body while it's being mixed: a soft, heavy surface that the beaters push around.
// Every point of the dough's surface is on a spring (it wants to go back to its rest height) and is
// tied to its neighbours (so a push spreads out as a slow, thick wave). The spinning beaters dig a
// hollow under themselves and throw the dough up into a rim around them; moving the mixer pushes a
// bow wave up in front of it and leaves a trough behind; and the dough is dragged round the bowl
// with them, each ring of it at its own speed, so it twists into a swirl. When the mixer stops it
// all wobbles and settles.
// (It works on the dough's Layer: rings of points around the middle of the bowl, see contents.js.
// The points themselves stay put: what goes round is the dough's bumps and its pattern, carried
// from point to point along each ring. Moving the points would stretch the triangles at the edge
// of the dough into slivers that cut through the curved bowl.)

const STEP = 1 / 120; // fixed time steps, so it's steady at any frame rate
const MAX_STEPS = 4;
const MAX_SPEED = 0.45; // how fast the mixer counts as moving, at most (a mouse can fling it much faster, which would throw the dough about)
const MAX_UP = 0.022; // and how far the surface can rise or sink from where it rests, at most (metres)

const STIFF = 230; // how hard each point is pulled back to its rest height
const DAMP = 7; // how quickly the wobbling dies down (low: jelly-like, high: like clay)
const WAVE = 520; // how strongly each point pulls its neighbours along

const BEATER = 0.02; // how wide a beater's push is (about the size of its whisk)
const DIG = 4.4; // how deep the spinning beaters dig in
const THROW = 4; // how high they throw the dough up around themselves
const BOW = 9; // how much the dough piles up in front of the moving mixer
const CHURN = 3.2; // the restless bubbling under the beaters

const DRAG = 7; // how strongly the beaters drag the dough round with them
const SPIN_DRIFT = 0.9; // and how fast it turns (radians per second) when the mixer only spins in place
const SPREAD = 40; // how much each ring drags its neighbours along (the dough is thick: it turns nearly as one)
const FRICTION = 1.6; // how quickly it stops turning
const UNTWIST = 0.8; // how quickly the twist between the rings evens out

const CALM = 1e-5; // below this much movement it's at rest and isn't worked out any more

export class DoughBody {

	constructor( layer ) {

		this.layer = layer;
		const count = layer.rest.length;
		const { rings, segs } = layer;
		this.rings = rings;
		this.segs = segs;

		this.h = new Float32Array( count ); // how far each point is off its rest height
		this.v = new Float32Array( count ); // and how fast it's moving
		this.a = new Float32Array( count );
		this.phase = new Float32Array( count ); // (for the churning)
		for ( let i = 0; i < count; i ++ ) this.phase[ i ] = Math.random() * Math.PI * 2;
		this.row = new Float32Array( segs ); // (one ring, while it's carried round)

		// the rings turning round the middle of the bowl: how far, and how fast
		this.turn = new Float32Array( rings + 1 );
		this.turnSpeed = new Float32Array( rings + 1 );
		this.whole = 0; // how far the dough has turned as a whole
		this.lag = new Float32Array( rings + 1 ); // and how far each ring is ahead of that
		this.carried = new Float32Array( rings + 1 ); // how far each ring's bumps are still to be carried (in points)

		// where each point is (from the middle) and how far out each ring is
		const position = layer.mesh.geometry.attributes.position.array;
		this.restX = new Float32Array( count );
		this.restZ = new Float32Array( count );
		for ( let i = 0; i < count; i ++ ) {

			this.restX[ i ] = position[ i * 3 ] - layer.x;
			this.restZ[ i ] = position[ i * 3 + 2 ] - layer.z;

		}

		this.ringRadius = new Float32Array( rings + 1 );
		for ( let r = 1; r <= rings; r ++ ) {

			const i = 1 + ( r - 1 ) * segs;
			this.ringRadius[ r ] = Math.hypot( this.restX[ i ], this.restZ[ i ] );

		}

		this.stir = null; // what the mixer is doing this frame (see stirWith())
		this.time = 0;
		this.leftover = 0;
		this.moving = false;

		layer.body = this;

	}

	// the mixer, this frame: where its beaters are (world x, z), how fast they spin (0..1), how fast
	// the mixer moves (vx, vz, world units per second) and goes round the bowl (orbit, radians per second)
	stirWith( stir ) {

		this.stir = stir;

	}

	// how much a point moves with the rest of the dough: not where it's hidden under the bowl's
	// wall or something else in the bowl (it's stuck there)
	free( i ) {

		const above = this.layer.above[ i ];
		return above <= 0 ? 0 : Math.min( above / 0.01, 1 );

	}

	update( dt ) {

		const stir = this.stir;
		this.stir = null;
		if ( ! stir && ! this.moving ) return; // at rest: nothing to do

		this.leftover = Math.min( this.leftover + dt, STEP * MAX_STEPS );
		let steps = 0;
		while ( this.leftover >= STEP ) {

			this.step( STEP, stir );
			this.leftover -= STEP;
			steps ++;

		}

		if ( steps > 0 ) this.layer.write();

	}

	step( dt, stir ) {

		const { h, v, a, rings, segs, turn, turnSpeed, lag, ringRadius, restX, restZ, phase } = this;
		const { x: cx, z: cz } = this.layer;
		const grown = this.layer.growth;
		this.time += dt;
		const fast = stir ? Math.hypot( stir.vx, stir.vz ) : 0;
		const slow = fast > MAX_SPEED ? MAX_SPEED / fast : 1;
		const vx = stir ? stir.vx * slow : 0;
		const vz = stir ? stir.vz * slow : 0;

		// ---- the rings turning: dragged by the beaters, dragging each other, slowing down ----
		for ( let r = 1; r <= rings; r ++ ) {

			let pull = 0;
			if ( stir ) {

				for ( const b of stir.beaters ) {

					const out = Math.hypot( b.x - cx, b.z - cz );
					const gap = ( ringRadius[ r ] - out ) / ( BEATER * 2.2 );
					const near = Math.exp( - gap * gap );
					// it follows the mixer round, and the beaters' spinning keeps it slowly turning
					pull += near * ( stir.orbit + SPIN_DRIFT * stir.spin - turnSpeed[ r ] ) * DRAG * 0.5;

				}

			}

			const inner = r > 1 ? turnSpeed[ r - 1 ] : turnSpeed[ r ];
			const outer = r < rings ? turnSpeed[ r + 1 ] : turnSpeed[ r ] * 0.6; // (the outside drags on the bowl)
			pull += ( inner + outer - 2 * turnSpeed[ r ] ) * SPREAD - turnSpeed[ r ] * FRICTION;
			turnSpeed[ r ] += pull * grown * dt;

		}

		// the pattern turns with the dough as a whole, each ring a little ahead or behind (that
		// twist evens out again as the dough folds over itself: left to build up, the rings'
		// patterns would end up so far apart they look like tree rings)
		let mean = 0;
		for ( let r = 1; r <= rings; r ++ ) mean += turnSpeed[ r ] / rings;
		this.whole = ( this.whole + mean * dt ) % ( Math.PI * 2 );
		for ( let r = 1; r <= rings; r ++ ) {

			lag[ r ] += ( turnSpeed[ r ] - mean - lag[ r ] * UNTWIST ) * dt;
			turn[ r ] = this.whole + lag[ r ];
			this.carry( r, turnSpeed[ r ] * dt );

		}

		// ---- up and down: each point's push, spring and neighbours ----
		const count = h.length;
		let energy = 0;
		for ( let i = 0; i < count; i ++ ) {

			const r = i === 0 ? 0 : 1 + Math.floor( ( i - 1 ) / segs );
			const s = i === 0 ? 0 : ( i - 1 ) % segs;

			// the neighbours: around the ring, and in and out (the middle has the whole first ring)
			let around;
			if ( i === 0 ) {

				around = 0;
				for ( let n = 1; n <= segs; n ++ ) around += h[ n ];
				around /= segs;

			} else {

				const ring = 1 + ( r - 1 ) * segs;
				const left = h[ ring + ( s + segs - 1 ) % segs ];
				const right = h[ ring + ( s + 1 ) % segs ];
				const inner = r === 1 ? h[ 0 ] : h[ i - segs ];
				const outer = r === rings ? 0 : h[ i + segs ];
				around = ( left + right + inner + outer ) / 4;

			}

			let force = WAVE * ( around - h[ i ] ) - STIFF * h[ i ] - DAMP * v[ i ];

			if ( stir ) {

				const px = cx + restX[ i ];
				const pz = cz + restZ[ i ];
				for ( const b of stir.beaters ) {

					const dx = ( px - b.x ) / BEATER;
					const dz = ( pz - b.z ) / BEATER;
					const q = dx * dx + dz * dz;
					if ( q > 9 ) continue;
					const e = Math.exp( - q );

					// a hollow right under the whisk, and the dough thrown up in a rim around it
					force += stir.spin * ( - DIG * e + THROW * q * e );
					// piled up in front of where it's going, a trough behind it
					force += BOW * ( dx * vx + dz * vz ) * e;
					// bubbling and heaving while it spins
					force += CHURN * stir.spin * e * Math.sin( this.time * 31 + phase[ i ] );

				}

			}

			a[ i ] = force * this.free( i ) * grown;
			energy += v[ i ] * v[ i ] + h[ i ] * h[ i ] * STIFF;

		}

		for ( let i = 0; i < count; i ++ ) {

			v[ i ] += a[ i ] * dt;
			h[ i ] += v[ i ] * dt;

			// never far from where it rests (whatever happens, the dough stays in the bowl)
			if ( h[ i ] > MAX_UP ) {

				h[ i ] = MAX_UP;
				if ( v[ i ] > 0 ) v[ i ] = 0;

			} else if ( h[ i ] < - MAX_UP ) {

				h[ i ] = - MAX_UP;
				if ( v[ i ] < 0 ) v[ i ] = 0;

			}

		}

		for ( let r = 1; r <= rings; r ++ ) energy += turnSpeed[ r ] * turnSpeed[ r ] * 1e-3;
		this.moving = stir !== null || energy / count > CALM;

	}

	// carries ring r's bumps round by `angle` (radians): each point takes the height of the dough
	// that was a little behind it. Saved up until it's at least a tenth of the way to the next point
	carry( r, angle ) {

		const { segs, row } = this;
		this.carried[ r ] += angle / ( Math.PI * 2 ) * segs;
		const shift = this.carried[ r ];
		if ( Math.abs( shift ) < 0.1 ) return;
		this.carried[ r ] = 0;

		const whole = Math.floor( shift );
		const part = shift - whole;
		const ring = 1 + ( r - 1 ) * segs;
		for ( const values of [ this.h, this.v ] ) {

			for ( let s = 0; s < segs; s ++ ) row[ s ] = values[ ring + s ];
			for ( let s = 0; s < segs; s ++ ) {

				const from = ( ( s - whole ) % segs + segs ) % segs; // (and part of the way to the one before)
				const before = ( from + segs - 1 ) % segs;
				values[ ring + s ] = row[ from ] * ( 1 - part ) + row[ before ] * part;

			}

		}

	}

	// writes the dough's surface where it is now: the heights, and where its pattern has been
	// carried to (the pattern at each point is the one that started `turn` further back)
	apply( position, flow ) {

		const { h, segs, restX, restZ, turn } = this;
		const { rest, x: cx, z: cz } = this.layer;
		let cos = 1;
		let sin = 0;
		for ( let i = 0; i < rest.length; i ++ ) {

			if ( i > 0 && ( i - 1 ) % segs === 0 ) {

				const r = 1 + ( i - 1 ) / segs;
				cos = Math.cos( - turn[ r ] );
				sin = Math.sin( - turn[ r ] );

			}

			position[ i * 3 + 1 ] = rest[ i ] + h[ i ] * this.free( i );
			flow[ i * 2 ] = cx + restX[ i ] * cos - restZ[ i ] * sin;
			flow[ i * 2 + 1 ] = cz + restX[ i ] * sin + restZ[ i ] * cos;

		}

	}

}
