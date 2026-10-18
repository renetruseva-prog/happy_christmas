// where the game's sounds go off: this watches the state and plays what fits (see audio.js).
// The mixer's motor is switched from the mixer's own frame loop.
import { subscribe } from '../core/state.js';
import { initAudio, play } from './audio.js';

initAudio();

let prev = null;

subscribe( ( s ) => {

	const last = prev;
	prev = { held: s.held, inBowl: s.inBowl.length, mixed: s.mixed, doughOut: s.doughOut, rolled: s.rolled, cookies: s.cookies.length, onTray: s.onTray.length, baking: s.baking, baked: s.baked, decorating: s.decorating };
	if ( ! last ) return;

	if ( s.held && ! last.held ) play( 'pick' );
	if ( s.inBowl.length > last.inBowl ) play( 'drop' );
	if ( s.mixed && ! last.mixed ) play( 'ding' );
	if ( s.doughOut && ! last.doughOut ) play( 'thud' );
	if ( s.rolled && ! last.rolled ) play( 'ding' );
	if ( s.cookies.length > last.cookies ) play( 'cut' );
	if ( s.onTray.length > last.onTray ) play( 'tray' );
	if ( s.baking !== last.baking ) play( 'door' );
	if ( s.baked && ! last.baked ) {

		play( 'ding' );
		setTimeout( () => play( s.baked.result === 'perfect' ? 'success' : 'fail' ), 500 );

	}

	if ( s.decorating && ! last.decorating ) play( 'success' );

} );
