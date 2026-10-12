// the smoke alarm: three short high beeps, over and over, while it's on. Made with Web Audio (no
// sound file). The browser only allows sound after the player has clicked something, which they
// always have by the time anything burns
let audio = null;
let timer = null;

function beep( at ) {

	const tone = audio.createOscillator();
	const volume = audio.createGain();
	tone.type = 'square';
	tone.frequency.value = 3100;
	volume.gain.setValueAtTime( 0, at );
	volume.gain.linearRampToValueAtTime( 0.035, at + 0.01 );
	volume.gain.setValueAtTime( 0.035, at + 0.11 );
	volume.gain.linearRampToValueAtTime( 0, at + 0.12 );
	tone.connect( volume ).connect( audio.destination );
	tone.start( at );
	tone.stop( at + 0.13 );

}

function beeps() {

	const now = audio.currentTime;
	for ( let i = 0; i < 3; i ++ ) beep( now + i * 0.2 );

}

export function setAlarm( on ) {

	if ( on === ( timer !== null ) ) return;

	if ( ! on ) {

		clearInterval( timer );
		timer = null;
		return;

	}

	try {

		audio ??= new AudioContext();
		audio.resume();
		beeps();
		timer = setInterval( beeps, 1100 );

	} catch { /* no sound: the alarm still shows on screen */ }

}

export function alarmOn() {

	return timer !== null;

}
