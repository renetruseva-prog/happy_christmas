// the baking step's tutorial cards: what to do next while carrying the cookies, how to get the tray
// into the oven, and how long to bake
import { bakeBand } from '../core/config.js';
import { showGuide, hideGuide } from '../ui.js';
import { getState } from '../core/state.js';
import { VIEWS } from '../core/views.js';
import { shownTemperature } from './knob.js';
import { carried, looseCookies, nearCookie, nearTray } from './carrying.js';

const OVEN_VIEW = VIEWS.oven; // the view of the tray and the oven, once the cookies are all on the tray

let camera = null;
let guideKey = ''; // which walking instructions are showing
let bakingGuide = false; // the how-long-to-bake tutorial is up, until the view comes in close to the oven

export function initGuides( cam ) {

	camera = cam;

}

// the walking instructions are shown again from the start (something changed in the hand)
export function resetGuide() {

	guideKey = '';

}

// whether the view is in close on the oven (closer than the view that shows the tray and the oven)
export function zoomedOnOven() {

	return camera.position.distanceTo( OVEN_VIEW.target ) < OVEN_VIEW.position.distanceTo( OVEN_VIEW.target ) * 0.7;

}

// what to do next, depending on whether a cookie is in the hand and how close the player is
export function guideCarrying() {

	const carrying = carried();
	const near = carrying ? nearTray() : looseCookies().some( nearCookie );
	const key = `${ carrying ? 'carry' : 'empty' }-${ near }`;
	if ( key === guideKey ) return;
	guideKey = key;

	const guides = {
		'empty-false': [ 'Walk to the dough to pick up the cookies', 'Use the arrow keys or W A S D to walk ahead, back, left and right' ],
		'empty-true': [ 'Click a cookie to pick it up', 'Then walk with the arrow keys to the baking tray next to the oven' ],
		'carry-false': [ 'Carry the cookie to the baking tray', 'Walk with the arrow keys or W A S D, towards the oven. Esc puts the cookie back' ],
		'carry-true': [ 'Click the baking tray to put the cookie down', 'Then walk back to the dough for the next one' ],
	};
	const [ text, small ] = guides[ key ];
	showGuide( { text, small, motion: 'drag' } );

}

export function guideTray() {

	guideKey = 'tray';
	showGuide( { text: 'Now put the tray in the oven', small: 'Hold the mouse on the baking tray and drag it into the oven', motion: 'drag' } );

}

// how long to bake at the heat it's set to now. It stays up until they zoom in on the oven (and
// comes back with the new times if they turn the heat meanwhile)
export function guideBaking() {

	const { from, to } = bakeBand( shownTemperature() );
	bakingGuide = true;
	showGuide( { text: 'Keep an eye on the clock!', small: `${ from }-${ to } seconds at ${ shownTemperature() }° makes them perfect. Click the oven to take them out`, motion: 'circle' } );

}

// every frame: the baking tutorial goes away once they're in close on the oven (or the cookies are out)
export function updateBakingGuide() {

	if ( bakingGuide && ( ! getState().baking || zoomedOnOven() ) ) {

		bakingGuide = false;
		hideGuide();

	}

}
