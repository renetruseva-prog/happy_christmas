// runs a list of timed steps one after another; runSequence() resolves when the last one ends
// a step is { duration, start?(), update?( k 0..1, dt ), end?() }
const running = [];

export function runSequence( steps ) {

	return new Promise( ( resolve ) => running.push( { steps, i: 0, t: 0, started: false, resolve } ) );

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
		step.update?.( k, dt );
		if ( k < 1 ) continue;

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
