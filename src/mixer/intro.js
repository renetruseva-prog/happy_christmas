// "Time to mix the dough!": the card that asks whether to mix with your hand (webcam) or the mouse.
// Choosing the camera asks the browser for it; if that's refused (or there's no webcam), the card
// says so and carries on with the mouse. Either way, onDone() is called when the card closes.
import { setState } from '../state.js';
import { startHandTracking } from '../handTracking.js';

const card = document.getElementById( 'mix-intro' );
const note = document.getElementById( 'mix-intro-note' );
const useCamera = document.getElementById( 'use-camera' );
const useMouse = document.getElementById( 'use-mouse' );

let onDone = () => {};

export function introShown() {

	return card.classList.contains( 'show' );

}

export function showIntro( done ) {

	onDone = done;
	note.textContent = '';
	useCamera.disabled = useMouse.disabled = false;
	card.classList.add( 'show' );
	useCamera.focus();

}

function close() {

	card.classList.remove( 'show' );
	onDone();

}

useCamera.addEventListener( 'click', async () => {

	useCamera.disabled = useMouse.disabled = true;
	note.textContent = 'Waiting for the camera… if your browser asks, click "Allow".';

	try {

		await startHandTracking();
		setState( { prefersCamera: true } ); // the next steps use the camera too
		close();

	} catch {

		// declined, or there's no webcam: that's fine, the mouse works too
		setState( { prefersCamera: false } );
		note.textContent = 'No camera? No problem, you can mix with the mouse!';
		setTimeout( close, 1600 );

	}

} );

useMouse.addEventListener( 'click', () => {

	setState( { prefersCamera: false } );
	close();

} );
