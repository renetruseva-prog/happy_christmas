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

// save whenever the state changes
export function trackProgress() {

	subscribe( ( { inBowl } ) => {

		try {

			localStorage.setItem( KEY, JSON.stringify( { inBowl: inBowl.map( ( r ) => r.userData.id ) } ) );

		} catch { /* storage unavailable: progress just won't persist */ }

	} );

}

export function resetProgress() {

	try {

		localStorage.removeItem( KEY );

	} catch { /* nothing to clear */ }

	location.reload();

}
