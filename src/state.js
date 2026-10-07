// the game's state, kept apart from rendering and input.
// Change it with setState(); anything that needs to react subscribes.

const state = {
	held: null, // the ingredient the player is carrying (a three.js object) or null
	inBowl: [], // ingredients already in the bowl
	total: 0, // how many ingredients the recipe needs
	busy: false, // an ingredient is being poured/cracked/dropped into the bowl
};

const listeners = new Set();

export function getState() {

	return state;

}

export function setState( patch ) {

	Object.assign( state, patch );
	for ( const fn of listeners ) fn( state );

}

export function subscribe( fn ) {

	listeners.add( fn );
	return () => listeners.delete( fn );

}
