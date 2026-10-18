// tiny position/scale animations (smoothstep), advanced once a frame by updateTweens
const tweens = [];

export function cancelTween( obj ) {

	const i = tweens.findIndex( ( tw ) => tw.obj === obj );
	if ( i >= 0 ) tweens.splice( i, 1 );

}

export function tweenTo( obj, to, { duration = 0.35, arc = 0, scale = null, onDone = null } = {} ) {

	cancelTween( obj );
	tweens.push( { obj, from: obj.position.clone(), to, fromScale: obj.scale.clone(), scale, arc, duration, t: 0, onDone } );

}

export function updateTweens( dt ) {

	for ( let i = tweens.length - 1; i >= 0; i -- ) {

		const tw = tweens[ i ];
		tw.t = Math.min( 1, tw.t + dt / tw.duration );
		const k = tw.t * tw.t * ( 3 - 2 * tw.t );
		tw.obj.position.lerpVectors( tw.from, tw.to, k );
		tw.obj.position.y += Math.sin( Math.PI * k ) * tw.arc;
		if ( tw.scale ) tw.obj.scale.lerpVectors( tw.fromScale, tw.scale, k );

		if ( tw.t >= 1 ) {

			tweens.splice( i, 1 );
			tw.onDone?.();

		}

	}

}
