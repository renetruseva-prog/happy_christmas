// what the oven shows while the cookies bake: the real time they've been in, the temperature on
// the display (for a moment after the knob's turned), the fire, the smoke when they burn, and the
// smoke alarm
import * as THREE from 'three/webgpu';
import { bakeBand } from '../core/config.js';
import { getState } from '../core/state.js';
import { showOvenTimer, clock } from '../ui.js';
import { bakeLevel } from '../cutting/cuts.js';
import { setHeat, showOnDisplay } from './oven.js';
import { updateSmoke, smokeLevel } from './smoke.js';
import { updateFlames, flareLevel } from './flames.js';
import { shownTemperature, heatLevel } from './knob.js';
import { setAlarm } from './alarm.js';

const SMOKE_ALARM = 0.3; // the alarm goes off when the smoke's this thick

let shown = ''; // what the oven's display shows now
let knobShownFor = 0; // the display shows the temperature for a moment after the knob's turned
let camera = null; // (the smoke is drawn towards it)

export function initOvenDisplay( cam ) {

	camera = cam;

}

// how long they've been in, in whole real seconds: the number on the oven's clock, and the one in
// the result. From the wall clock (bakeStart is saved, so a refresh doesn't change it), not from
// the frames, which are capped and slow
export function realSeconds() {

	const { bakeStart } = getState();
	return bakeStart === null ? 0 : Math.max( 0, Math.floor( ( Date.now() - bakeStart ) / 1000 ) );

}

// how far along they are, where 1 is the start of perfect at the heat the dial shows
export function bakeProgress() {

	return realSeconds() / bakeBand( shownTemperature() ).from;

}

// the knob was turned just now: the display shows the temperature for a moment
export function knobTurned() {

	knobShownFor = 1.5;

}

// every frame. knobHeld: the knob is being dragged; ray: through the mouse; overOven: the mouse is
// over the oven
export function updateOven( dt, { knobHeld, ray, overOven } ) {

	// in the oven: the clock is the real time since they went in (see realSeconds)
	const { baking } = getState();
	const s = baking ? realSeconds() : 0;
	const band = bakeBand( shownTemperature() );
	if ( baking ) bakeLevel.value = bakeProgress();

	// the oven's display: the temperature for a moment after the knob's turned (and whenever
	// it's not baking), otherwise the clock
	knobShownFor -= dt;
	const showKnob = knobHeld || knobShownFor > 0 || ! baking;
	const text = showKnob ? `${ shownTemperature() }°` : clock( s );
	const warn = ! showKnob && s > band.to;
	if ( text + warn !== shown ) {

		shown = text + warn;
		showOnDisplay( text, { warn } );

	}

	// the fire: higher the hotter the oven's set, flaring when the door opens; it follows the
	// mouse while that's over the oven
	updateFlames( dt, { target: baking ? 1 : 0, hot: heatLevel(), ray, overOven } );
	setHeat( ( baking ? 0.4 + 0.9 * heatLevel() : 0 ) + flareLevel(), performance.now() / 1000 );

	// smoke (a Shadertoy shader too, see shaders/smoke.js): from the last perfect second, as they
	// start to burn, thicker and darker until they're black; it clears once they're out, or for a while
	// when it's waved away. Thick smoke sets off the alarm and hides the clock
	const smoking = baking ? THREE.MathUtils.clamp( ( s - ( band.to - 1 ) ) / 15, 0, 1 ) : 0;
	updateSmoke( dt, { target: smoking, darkness: THREE.MathUtils.clamp( ( s - band.to ) / 10, 0, 1 ), ray, camera } );
	const smoke = smokeLevel();
	setAlarm( baking && smoke > SMOKE_ALARM ); // (only while it's baking: once the cookies are out it's quiet at once)
	if ( baking ) showOvenTimer( s, { temperature: shownTemperature(), smoke, alarm: smoke > SMOKE_ALARM } );

}
