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

// ---------- the little tutorial: an icon showing the movement, and what to do ----------
const guide = document.getElementById( 'tutorial' );
const guideIcon = document.getElementById( 'tutorial-icon' );
const guideMotion = document.getElementById( 'tutorial-motion' );
const guideText = document.getElementById( 'tutorial-text' );
const guideSmall = document.getElementById( 'tutorial-small' );
const MOTIONS = {
	circle: { show: 'tutorial-circle', path: 'M32,10 a22,22 0 1,1 -0.01,0', dur: '1.6s' }, // going round (mixing)
	line: { show: 'tutorial-line', path: 'M32,12 L32,52 Z', dur: '1.4s' }, // forward and back (rolling)
};

// motion: 'circle' or 'line'
export function showGuide( { icon, text, small = '', motion = 'circle' } ) {

	const m = MOTIONS[ motion ];
	for ( const [ name, other ] of Object.entries( MOTIONS ) ) document.getElementById( other.show ).style.display = name === motion ? '' : 'none';
	guideMotion.setAttribute( 'path', m.path );
	guideMotion.setAttribute( 'dur', m.dur );
	guideIcon.firstChild.textContent = icon;
	guideText.textContent = text;
	guideSmall.textContent = small;
	guide.classList.add( 'show' );

}

export function hideGuide() {

	guide.classList.remove( 'show' );

}

export function guideShown() {

	return guide.classList.contains( 'show' );

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
