// everything that touches the HTML overlay
import { subscribe } from './state.js';

const hintEl = document.getElementById( 'hint' );
const statusEl = document.getElementById( 'status' );

export function showHint( text, { clickable = true } = {} ) {

	hintEl.textContent = text;
	hintEl.style.opacity = 1;
	document.body.style.cursor = clickable ? 'pointer' : '';

}

export function hideHint() {

	hintEl.style.opacity = 0;
	document.body.style.cursor = '';

}

// replace the progress box's text (e.g. the mixing percentage)
export function showStatus( text ) {

	statusEl.textContent = text;
	statusEl.style.opacity = 1;

}

// the bowl progress box redraws whenever the state changes
subscribe( ( { inBowl, total, mixed, mixing } ) => {

	if ( mixing ) return; // the mixer shows its own progress

	if ( inBowl.length === 0 ) {

		statusEl.style.opacity = 0;
		return;

	}

	const names = inBowl.map( ( r ) => r.userData.ingredient ).join( ', ' );
	if ( mixed ) statusEl.textContent = 'The dough is ready! · press R to start over';
	else if ( inBowl.length === total ) statusEl.textContent = 'All ingredients are in the bowl! Grab the mixer · press R to start over';
	else statusEl.textContent = `Bowl ${ inBowl.length }/${ total } · ${ names }`;
	statusEl.style.opacity = 1;

} );
