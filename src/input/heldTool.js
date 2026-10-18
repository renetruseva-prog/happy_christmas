// what the mixer and the rolling pin have in common while you hold one over your work:
// - the mouse: where it points, and whether its button is held (that works the tool)
// - your hand instead (webcam): the camera button and C switch between hand and mouse,
//   and if you chose your hand before, the camera comes back on by itself
// - Esc puts the tool down
// - the view is locked, so dragging works the tool instead of turning the view (or with freeView:
//   dragging over the work uses the tool, dragging anywhere else turns the view)
// - the little tutorial: shown when you start, hidden once you're getting on with it,
//   and back if you stop for a few seconds
import * as THREE from 'three/webgpu';
import { getState, setState } from '../core/state.js';
import { showGuide, hideGuide, guideShown } from '../ui.js';
import { startHandTracking, stopHandTracking, updateHandTracking, isTracking, handPosition } from './handTracking.js';

const cameraButton = document.getElementById( 'camera-btn' );

export class HeldTool {

	// verb: for the camera button ("Mix with your hand")
	// guide: { motion: 'circle' | 'line', hand: { text, small }, mouse: { text, small } }
	// hints: what the hover hint says while holding it: { handMoving, handMissing, mouseOn, mouseOff }
	// progress(): how far the job is (0..1), so the tutorial knows when you're getting on with it
	// onEscape(): put it down
	// freeView: the view can still be turned while holding it. The left button then works the tool
	// only when it's pressed over the work (workArea( raycaster ) says where); anywhere else it turns
	// the view, like in the other scenes
	constructor( { camera, controls, canvas, verb, guide, hints, progress, onEscape, freeView = false, workArea = null } ) {

		this.camera = camera;
		this.controls = controls;
		this.freeView = freeView;
		this.workArea = workArea;
		this.verb = verb;
		this.guide = guide;
		this.hints = hints;
		this.progress = progress;

		this.holding = false; // over the work, ready to use
		this.mouseDown = false;
		this.pointer = new THREE.Vector2( 2, 2 );
		this.raycaster = new THREE.Raycaster();
		this.guideFrom = 0; // progress when the tutorial last showed
		this.stillFor = 0; // seconds without progress

		window.addEventListener( 'pointermove', ( e ) => {

			this.pointer.set( ( e.clientX / window.innerWidth ) * 2 - 1, - ( e.clientY / window.innerHeight ) * 2 + 1 );

		} );
		canvas.addEventListener( 'pointerdown', ( e ) => {

			if ( ! this.holding || e.button !== 0 ) return;
			if ( this.freeView && this.workArea ) {

				// (before the view's controls get the press: over the work it's the tool's, elsewhere it turns the view)
				this.pointer.set( ( e.clientX / window.innerWidth ) * 2 - 1, - ( e.clientY / window.innerHeight ) * 2 + 1 );
				this.raycaster.setFromCamera( this.pointer, this.camera );
				if ( ! this.workArea( this.raycaster ) ) return;
				e.stopImmediatePropagation();

			}

			this.mouseDown = true;

		}, true );
		window.addEventListener( 'pointerup', () => { this.mouseDown = false; } );
		window.addEventListener( 'blur', () => { this.mouseDown = false; } );
		window.addEventListener( 'keydown', ( e ) => {

			if ( ! this.holding ) return;
			if ( e.key === 'Escape' ) onEscape();
			if ( e.key === 'c' || e.key === 'C' ) this.toggleCamera();
			if ( this.freeView ) this.turnWithKey( e );

		} );
		cameraButton.addEventListener( 'click', () => this.toggleCamera() );

	}

	// ---------- picking it up and putting it down ----------
	// picked up: the view stops turning (before it's carried over)
	lockView() {

		if ( ! this.freeView ) {

			this.controls.enabled = false;
			return;

		}

		this.controls.enabled = true;

	}

	// the arrow keys also turn the view around what it looks at (hold one down)
	turnWithKey( e ) {

		const turn = { ArrowLeft: [ - 1, 0 ], ArrowRight: [ 1, 0 ], ArrowUp: [ 0, - 1 ], ArrowDown: [ 0, 1 ] }[ e.key ];
		if ( ! turn ) return;
		e.preventDefault();

		const { camera, controls } = this;
		const offset = camera.position.clone().sub( controls.target );
		const spherical = new THREE.Spherical().setFromVector3( offset );
		spherical.theta += turn[ 0 ] * 0.06;
		spherical.phi = THREE.MathUtils.clamp( spherical.phi + turn[ 1 ] * 0.04, 0.2, Math.PI / 2 - 0.05 );
		camera.position.copy( controls.target ).add( offset.setFromSpherical( spherical ) );
		controls.update();

	}

	// it's over the work now, ready to use
	async begin() {

		this.holding = true;
		this.updateButton();
		cameraButton.classList.add( 'show' );
		if ( getState().prefersCamera && ! isTracking() ) await this.startCamera(); // they used their hand before
		this.showGuide();

	}

	// put down: the camera goes off and the tutorial away (call unlockView() once it's back in its place)
	end() {

		this.holding = false;
		this.mouseDown = false;
		cameraButton.classList.remove( 'show' );
		stopHandTracking();
		hideGuide();

	}

	unlockView() {

		this.controls.enabled = true;

	}

	// ---------- hand or mouse ----------
	async toggleCamera() {

		if ( ! this.holding ) return;

		if ( isTracking() ) {

			stopHandTracking();
			setState( { prefersCamera: false } );
			this.updateButton();

		} else await this.startCamera();

		this.showGuide();

	}

	async startCamera() {

		cameraButton.textContent = 'Starting the camera…';
		try {

			await startHandTracking();
			if ( ! this.holding ) return stopHandTracking(); // put down while the camera was starting
			setState( { prefersCamera: true } );
			this.updateButton();

		} catch {

			cameraButton.textContent = 'No camera · use the mouse'; // refused, or there's no webcam

		}

	}

	updateButton() {

		cameraButton.textContent = isTracking() ? 'Use the mouse instead (C)' : `${ this.verb } with your hand (C)`;

	}

	// where the hand is in the camera picture (0..1), or null: no camera, or no hand seen
	hand() {

		updateHandTracking();
		return isTracking() ? handPosition() : null;

	}

	usingCamera() {

		return isTracking();

	}

	// where the mouse points on a plane (sets `target`; false if it points away from it)
	pointerOn( plane, target ) {

		this.raycaster.setFromCamera( this.pointer, this.camera );
		return this.raycaster.ray.intersectPlane( plane, target ) !== null;

	}

	// ---------- the tutorial and the hint ----------
	showGuide() {

		const withHand = isTracking();
		const { text, small } = withHand ? this.guide.hand : this.guide.mouse;
		showGuide( { text, small, motion: this.guide.motion } );
		this.guideFrom = this.progress();
		this.stillFor = 0;

	}

	// every frame while holding it: the tutorial hides once you're getting on with it, and comes
	// back if nothing happens for 3 seconds. gained: how much progress this frame made
	updateGuide( gained, dt ) {

		this.stillFor = gained > 0 ? 0 : this.stillFor + dt;
		if ( this.progress() - this.guideFrom > 0.12 ) hideGuide();
		if ( this.stillFor > 3 && ! guideShown() ) this.showGuide();

	}

	// the hover hint while holding it (false while the tutorial is up: it already says it).
	// on: the tool is being worked right now
	hint( on ) {

		if ( guideShown() ) return false;
		if ( isTracking() ) return { text: handPosition() ? this.hints.handMoving : this.hints.handMissing, clickable: false };
		return { text: on ? this.hints.mouseOn : this.hints.mouseOff, clickable: false };

	}

}
