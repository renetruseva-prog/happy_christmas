// saves how far the player got in the browser, so a refresh doesn't reset it
import { subscribe } from './state.js';

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

// how far the baking got: { onTray, bakeStart, bakeProgress, temperature, baked } (see state.js)
export function loadBaking() {

	return {
		onTray: Array.isArray( saved.onTray ) ? saved.onTray.filter( Number.isInteger ) : [],
		bakeStart: typeof saved.bakeStart === 'number' ? saved.bakeStart : null,
		bakeProgress: typeof saved.bakeProgress?.seconds === 'number' ? saved.bakeProgress : null,
		temperature: typeof saved.temperature === 'number' ? saved.temperature : null,
		baked: saved.baked?.result ? saved.baked : null,
	};

}

// whether all the cookies were cut out
export function loadCut() {

	return saved.cut === true;

}

// save whenever the state changes
export function trackProgress() {

	subscribe( ( { inBowl, mixed, doughOut, rolled, cookies, cut, onTray, bakeStart, bakeProgress, temperature, baked } ) => {

		try {

			localStorage.setItem( KEY, JSON.stringify( { inBowl: inBowl.map( ( r ) => r.userData.id ), mixed, doughOut, rolled, cookies, cut, onTray, bakeStart, bakeProgress, temperature, baked } ) );

		} catch { /* storage unavailable: progress just won't persist */ }

	} );

}

export function resetProgress() {

	try {

		localStorage.removeItem( KEY );

	} catch { /* nothing to clear */ }

	location.reload();

}
