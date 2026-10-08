// timed animations, advanced once a frame by updateSequences( dt ).
// runSequence() runs a list of steps one after another and resolves when the last one ends;
// a step is { duration, start?(), update?( k 0..1, dt ), end?() }. An update that returns true
// ends its step early. animate() and until() are the one-step versions, so a sequence of
// moves can be written top to bottom with await.
const running = [];

export function runSequence( steps ) {

	return new Promise( ( resolve ) => running.push( { steps, i: 0, t: 0, started: false, resolve } ) );

}

// call update( k, dt ) every frame for `duration` seconds, k going 0 → 1
export function animate( duration, update ) {

	return runSequence( [ { duration, update } ] );

}

// call update( dt ) every frame until it returns true
export function until( update ) {

	return runSequence( [ { duration: Infinity, update: ( k, dt ) => update( dt ) } ] );

}

export function updateSequences( dt ) {

	for ( let n = running.length - 1; n >= 0; n -- ) {

		const seq = running[ n ];
		const step = seq.steps[ seq.i ];

		if ( ! seq.started ) {

			step.start?.();
			seq.started = true;

		}

		seq.t += dt;
		const k = Math.min( 1, seq.t / step.duration );
		const done = step.update?.( k, dt ) === true;
		if ( k < 1 && ! done ) continue;

		step.end?.();
		seq.i ++;
		seq.t = 0;
		seq.started = false;

		if ( seq.i >= seq.steps.length ) {

			running.splice( n, 1 );
			seq.resolve();

		}

	}

}

// ---------- easing ----------
// slow start and slow end
export const ease = ( k ) => k * k * ( 3 - 2 * k );

// overshoots a little, then settles (for things popping up)
export const easeOutBack = ( k ) => 1 + 2.2 * ( k - 1 ) ** 3 + 1.2 * ( k - 1 ) ** 2;

// move `target` from `from` to `to` (k 0 → 1) along an arc that rises `height` in the middle
export function arcLerp( target, from, to, k, height ) {

	target.lerpVectors( from, to, k );
	target.y += Math.sin( Math.PI * k ) * height;

}
