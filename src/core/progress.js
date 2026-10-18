// saves how far the player got in the browser, so a refresh doesn't reset it
import { subscribe } from './state.js';
import { INGREDIENTS } from './config.js';

const KEY = 'happy-christmas-progress';

// what was saved, read once when the page loads. Every step restores from this copy, because
// restoring one step changes the state, which saves again and would overwrite the later steps
// before they've been read
const saved = ( () => {

	try {

		return JSON.parse( localStorage.getItem( KEY ) ) ?? {};

	} catch {

		return {}; // storage blocked or the saved data is broken: start fresh

	}

} )();

// ids (Blender node names) of the ingredients already in the bowl
export function loadProgress() {

	return Array.isArray( saved.inBowl ) ? saved.inBowl : [];

}

// whether the ingredients were already mixed into dough
export function loadMixed() {

	return saved.mixed === true;

}

// how far the dough got after mixing: { doughOut, rolled }
export function loadDoughProgress() {

	return { doughOut: saved.doughOut === true, rolled: saved.rolled === true };

}

// the cookies already cut out: [ { shape, points } ] (see cutting/cuts.js)
export function loadCookies() {

	return Array.isArray( saved.cookies ) ? saved.cookies.filter( ( c ) => Array.isArray( c?.points ) && c.points.length >= 3 ) : [];

}

// how far the baking got: { onTray, bakeStart, temperature, baked } (see state.js)
export function loadBaking() {

	return {
		onTray: Array.isArray( saved.onTray ) ? saved.onTray.filter( Number.isInteger ) : [],
		bakeStart: typeof saved.bakeStart === 'number' ? saved.bakeStart : null,
		temperature: typeof saved.temperature === 'number' ? saved.temperature : null,
		baked: saved.baked?.result ? saved.baked : null,
	};

}

// the decorating: { decorating, decor: { cookies, spills } } (see decorating/)
export function loadDecor() {

	const decor = saved.decor && typeof saved.decor === 'object' && ! Array.isArray( saved.decor ) ? saved.decor : {};
	return { decorating: saved.decorating === true, decor: { cookies: Array.isArray( decor.cookies ) ? decor.cookies : [], spills: Array.isArray( decor.spills ) ? decor.spills : [] } };

}

// whether all the cookies were cut out
export function loadCut() {

	return saved.cut === true;

}

// a brand new game: nothing's been done yet (so the welcome card is shown)
export function isNewGame() {

	return loadProgress().length === 0 && ! loadMixed() && ! saved.doughOut && loadCookies().length === 0;

}

// save whenever the state changes
export function trackProgress() {

	subscribe( ( { inBowl, mixed, doughOut, rolled, cookies, cut, onTray, bakeStart, temperature, baked, decorating, decor } ) => {

		try {

			localStorage.setItem( KEY, JSON.stringify( { inBowl: inBowl.map( ( r ) => r.userData.id ), mixed, doughOut, rolled, cookies, cut, onTray, bakeStart, temperature, baked, decorating, decor } ) );

		} catch { /* storage unavailable: progress just won't persist */ }

	} );

}

export function resetProgress() {

	try {

		localStorage.removeItem( KEY );

	} catch { /* nothing to clear */ }

	location.reload();

}

// testing cheats (not mentioned anywhere in the game): Shift+A jumps to cutting the cookies, with the
// dough rolled out; Shift+B to a batch of 6 cookies cut and ready on the baking tray. Both reload
function readyToCut() {

	return { inBowl: Object.keys( INGREDIENTS ), mixed: true, doughOut: true, rolled: true, cookies: [], cut: false, onTray: [], bakeStart: null, temperature: 180, baked: null, decorating: false, decor: {} };

}

function readyBatch() {

	const cookies = [];
	for ( let i = 0; i < 6; i ++ ) {

		const cx = ( i % 3 - 1 ) * 0.065;
		const cz = ( Math.floor( i / 3 ) - 0.5 ) * 0.06;
		const points = [];
		for ( let k = 0; k < 10; k ++ ) {

			const a = ( - 162 + 36 * k ) * Math.PI / 180;
			const r = k % 2 === 0 ? 0.025 : 0.0115;
			points.push( [ + ( cx + Math.cos( a ) * r ).toFixed( 4 ), + ( cz + Math.sin( a ) * r ).toFixed( 4 ) ] );

		}

		cookies.push( { shape: 'star', points } );

	}

	return { inBowl: Object.keys( INGREDIENTS ), mixed: true, doughOut: true, rolled: true, cookies, cut: true, onTray: [ 0, 1, 2, 3, 4, 5 ], bakeStart: null, temperature: 180, baked: null, decorating: false, decor: {} };

}

const CHEATS = { KeyA: readyToCut, KeyB: readyBatch };

window.addEventListener( 'keydown', ( e ) => {

	const cheat = CHEATS[ e.code ];
	if ( ! cheat || ! e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat ) return;
	if ( e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ) return;
	try {

		localStorage.setItem( KEY, JSON.stringify( cheat() ) );
		location.reload();

	} catch { /* storage unavailable */ }

} );
