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

// the bowl progress box redraws whenever the state changes
subscribe( ( { inBowl, total } ) => {

	if ( inBowl.length === 0 ) {

		statusEl.style.opacity = 0;
		return;

	}

	const names = inBowl.map( ( r ) => r.userData.ingredient ).join( ', ' );
	statusEl.textContent = inBowl.length === total ? 'All ingredients are in the bowl!' : `Bowl ${ inBowl.length }/${ total } · ${ names }`;
	statusEl.style.opacity = 1;

} );
