// saves how far the player got in the browser, so a refresh doesn't reset it
import { subscribe } from './state.js';

const KEY = 'happy-christmas-progress';

// ids (Blender node names) of the ingredients already in the bowl
export function loadProgress() {

	try {

		const saved = JSON.parse( localStorage.getItem( KEY ) );
		return Array.isArray( saved?.inBowl ) ? saved.inBowl : [];

	} catch {

		return []; // storage blocked or the saved data is broken: start fresh

	}

}

// whether the ingredients were already mixed into dough
export function loadMixed() {

	try {

		return JSON.parse( localStorage.getItem( KEY ) )?.mixed === true;

	} catch {

		return false;

	}

}

// save whenever the state changes
export function trackProgress() {

	subscribe( ( { inBowl, mixed } ) => {

		try {

			localStorage.setItem( KEY, JSON.stringify( { inBowl: inBowl.map( ( r ) => r.userData.id ), mixed } ) );

		} catch { /* storage unavailable: progress just won't persist */ }

	} );

}

export function resetProgress() {

	try {

		localStorage.removeItem( KEY );

	} catch { /* nothing to clear */ }

	location.reload();

}
