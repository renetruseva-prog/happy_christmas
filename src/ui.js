// everything that touches the HTML overlay
import { subscribe } from './state.js';
import { COOKIE_COUNT } from './config.js';

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
	star: { show: 'tutorial-star', path: 'M32,8 L38.5,23.1 L54.8,24.6 L42.5,35.4 L46.1,51.4 L32,43 L17.9,51.4 L21.5,35.4 L9.2,24.6 L25.5,23.1 Z', dur: '4s' }, // round a star (cutting)
};

// motion: 'circle', 'line' or 'star'
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

// the progress box redraws whenever the state changes
subscribe( ( { inBowl, total, mixed, mixing, doughOut, rolling, rolled, cookies, cut } ) => {

	if ( mixing || rolling ) return; // they show their own progress

	if ( inBowl.length === 0 ) {

		statusEl.style.opacity = 0;
		return;

	}

	const names = inBowl.map( ( r ) => r.userData.ingredient ).join( ', ' );
	const left = COOKIE_COUNT - cookies.length;
	if ( cut ) statusEl.textContent = 'The cookies are cut out! · press R to start over';
	else if ( rolled && cookies.length > 0 ) statusEl.textContent = `${ left } more cookie${ left === 1 ? '' : 's' } to cut out`;
	else if ( rolled ) statusEl.textContent = `Cut ${ COOKIE_COUNT } cookies out of the dough: with a star cutter, or draw your own shape`;
	else if ( doughOut ) statusEl.textContent = 'Roll the dough out thin with the rolling pin';
	else if ( mixed ) statusEl.textContent = 'The dough is ready! Take it out of the bowl';
	else if ( inBowl.length === total ) statusEl.textContent = 'All ingredients are in the bowl! Grab the mixer · press R to start over';
	else statusEl.textContent = `Bowl ${ inBowl.length }/${ total } · ${ names }`;
	statusEl.style.opacity = 1;

} );

// ---------- the cookie counter: a slot for each cookie, filled in as they're cut ----------
const counter = document.getElementById( 'cookie-counter' );
const slots = counter.querySelector( '.slots' );
const count = document.getElementById( 'cookie-count' );
for ( let i = 0; i < COOKIE_COUNT; i ++ ) slots.append( Object.assign( document.createElement( 'span' ), { className: 'slot' } ) );

subscribe( ( { rolled, cookies } ) => {

	counter.classList.toggle( 'show', rolled );
	[ ...slots.children ].forEach( ( slot, i ) => {

		const cookie = cookies[ i ];
		const filled = !! cookie;
		if ( slot.classList.contains( 'filled' ) === filled ) return; // (so only the new one pops)
		slot.classList.toggle( 'filled', filled );
		slot.textContent = filled ? ( cookie.shape === 'star' ? '⭐' : '🍪' ) : '';

	} );
	count.textContent = `${ Math.min( cookies.length, COOKIE_COUNT ) } / ${ COOKIE_COUNT }`;

} );

// ---------- "all the cookies are cut out!" ----------
const done = document.getElementById( 'cookies-done' );
const doneOk = document.getElementById( 'cookies-done-ok' );
doneOk.addEventListener( 'click', () => done.classList.remove( 'show' ) );
window.addEventListener( 'keydown', ( e ) => { if ( done.classList.contains( 'show' ) && ( e.key === 'Escape' || e.key === 'Enter' ) ) done.classList.remove( 'show' ); } );

export function showCookiesDone( text ) {

	document.getElementById( 'cookies-done-text' ).textContent = text;
	done.classList.add( 'show' );
	doneOk.focus();

}

