// webcam hand tracking with MediaPipe's Hand Landmarker. It all runs in the browser: the video
// never leaves the computer (only the tracking model is downloaded, once).
// startHandTracking() asks for the camera; handPosition() says where the hand is in the picture
// (0..1, mirrored so it moves like a mirror), or null while no hand is seen.
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// the wasm files of the same version as the installed package, and Google's hand model
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const PALM = 9; // landmark at the base of the middle finger: the middle of the hand

const box = document.getElementById( 'camera' );
const video = box.querySelector( 'video' );
const canvas = box.querySelector( 'canvas' );
const ctx = canvas.getContext( '2d' );

let landmarker = null;
let stream = null;
let starting = null;
let active = false;
let lastFrame = - 1;
let palm = null;

export function isTracking() {

	return active;

}

export function handPosition() {

	return palm;

}

// load the tracker (the model is a few MB): done once, early, so the camera starts quickly later.
// It doesn't touch the camera.
let loading = null;
export function preloadHandTracker() {

	loading ??= FilesetResolver.forVisionTasks( WASM )
		.then( ( vision ) => HandLandmarker.createFromOptions( vision, {
			baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
			runningMode: 'VIDEO',
			numHands: 1,
		} ) )
		.then( ( result ) => { landmarker = result; } )
		.catch( ( error ) => {

			loading = null; // try again next time
			throw error;

		} );
	return loading;

}

export function startHandTracking() {

	if ( active ) return Promise.resolve();
	if ( starting ) return starting;

	starting = ( async () => {

		try {

			stream = await navigator.mediaDevices.getUserMedia( { video: { width: 640, height: 480, facingMode: 'user' }, audio: false } );
			video.srcObject = stream;
			await video.play();

			await preloadHandTracker();

			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
			box.classList.add( 'on' );
			active = true;

		} catch ( error ) {

			stopHandTracking();
			throw error;

		} finally {

			starting = null;

		}

	} )();

	return starting;

}

export function stopHandTracking() {

	active = false;
	palm = null;
	stream?.getTracks().forEach( ( track ) => track.stop() ); // turns the camera (and its light) off
	stream = null;
	video.srcObject = null;
	box.classList.remove( 'on' );
	ctx.clearRect( 0, 0, canvas.width, canvas.height );

}

// call every frame: looks for the hand in each new camera frame
export function updateHandTracking() {

	if ( ! active || video.readyState < 2 || video.currentTime === lastFrame ) return;
	lastFrame = video.currentTime;

	const hand = landmarker.detectForVideo( video, performance.now() ).landmarks[ 0 ];
	palm = hand ? { x: 1 - hand[ PALM ].x, y: hand[ PALM ].y } : null;
	drawHand( hand );

}

// the tracked points and bones over the camera preview, so the player sees what the game sees
function drawHand( hand ) {

	const { width: w, height: h } = canvas;
	ctx.clearRect( 0, 0, w, h );
	if ( ! hand ) return;

	ctx.strokeStyle = 'rgba(255, 226, 180, 0.9)';
	ctx.lineWidth = 3;
	ctx.beginPath();
	for ( const { start, end } of HandLandmarker.HAND_CONNECTIONS ) {

		ctx.moveTo( hand[ start ].x * w, hand[ start ].y * h );
		ctx.lineTo( hand[ end ].x * w, hand[ end ].y * h );

	}

	ctx.stroke();

	ctx.fillStyle = '#ff5a4a';
	for ( const point of hand ) {

		ctx.beginPath();
		ctx.arc( point.x * w, point.y * h, 4, 0, Math.PI * 2 );
		ctx.fill();

	}

	// the point that steers the mixer
	ctx.fillStyle = '#ffe14a';
	ctx.beginPath();
	ctx.arc( hand[ PALM ].x * w, hand[ PALM ].y * h, 9, 0, Math.PI * 2 );
	ctx.fill();

}
