// telling stirring in circles apart from anything else. It counts how far the mixer turned around
// the middle of the bowl over the last 2 seconds: going round adds up, while going back and forth
// or just holding a hand up cancels out to (almost) nothing.
import * as THREE from 'three/webgpu';
import { MIX_DISTANCE, MIN_SWIRL } from '../config.js';

const WINDOW = 2; // seconds

export class SwirlMeter {

	constructor() {

		this.turns = []; // { t, turn } per frame
		this.clock = 0;
		this.lastTarget = new THREE.Vector3(); // where the mouse/hand pointed last frame

	}

	reset() {

		this.turns.length = 0;

	}

	// how much mixing this frame did (0..1 of the whole job). The mixer moved from `from` to `to`
	// around the bowl's `center`; `target` is where the mouse/hand points; on: it's switched on.
	// It only counts when it's on, going round fast enough, not right in the middle (where angles
	// jump around), and the mouse/hand is moving right now (not the mixer, which glides on for a
	// moment after you stop).
	measure( { center, radius, from, to, target, dt, on } ) {

		this.clock += dt;
		const before = Math.atan2( from.z - center.z, from.x - center.x );
		const after = Math.atan2( to.z - center.z, to.x - center.x );
		const distance = Math.hypot( to.x - center.x, to.z - center.z );
		const turn = distance > radius * 0.15 ? Math.atan2( Math.sin( after - before ), Math.cos( after - before ) ) : 0;

		this.turns.push( { t: this.clock, turn } );
		while ( this.turns.length && this.turns[ 0 ].t < this.clock - WINDOW ) this.turns.shift();
		const rate = Math.abs( this.turns.reduce( ( sum, f ) => sum + f.turn, 0 ) ) / WINDOW;

		const moving = dt > 0 && Math.hypot( target.x - this.lastTarget.x, target.z - this.lastTarget.z ) / dt > 0.02;
		this.lastTarget.copy( target );

		return on && moving ? Math.max( 0, rate - MIN_SWIRL ) * distance * dt / MIX_DISTANCE : 0;

	}

}
