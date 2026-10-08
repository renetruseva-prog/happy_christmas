// the game's state, kept apart from rendering and input.
// Change it with setState(); anything that needs to react subscribes.

const state = {
	held: null, // the ingredient the player is carrying (a three.js object) or null
	inBowl: [], // ingredients already in the bowl
	total: 0, // how many ingredients the recipe needs
	busy: false, // an ingredient is being poured/cracked/dropped into the bowl
	mixing: false, // the player is holding the mixer over the bowl
	mixed: false, // the ingredients have been mixed into dough
	prefersCamera: false, // the player chose to use their hand (webcam) instead of the mouse
	doughOut: false, // the dough has been taken out of the bowl onto the table
	rolling: false, // the player is rolling the dough with the rolling pin
	rolled: false, // the dough has been rolled out thin
	cutting: false, // the player is holding a cookie cutter or drawing a shape on the dough
	cookies: [], // the cookies cut out of the dough so far, as saved (see cutting/cuts.js)
	cut: false, // all the cookies are cut out
	onTray: [], // which cookies (their number in `cookies`) are on the baking tray, in order
	baking: false, // the cookies are in the oven
	bakeStart: null, // when they went in (Date.now(), so a refresh doesn't stop the clock)
	baked: null, // once they're out: { result: 'under' | 'perfect' | 'burnt', seconds }
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
