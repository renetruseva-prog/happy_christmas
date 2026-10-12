// the smoke alarm: three short high beeps, over and over, while it's on. Made with Web Audio (no
// sound file). The browser only allows sound after the player has clicked something, which they
// always have by the time anything burns.
// It can't get stuck on: the game has to keep asking for it every frame (setAlarm( true )), and if
// it stops asking (the tab went to the background, the page is stuck) the alarm goes quiet by
// itself within half a second. It's also silenced at once when the tab is hidden.
let audio = null;
let timer = null;
let lastAsked = 0; // when the game last asked for it (ms)

const GIVE_UP_AFTER = 500; // ms without being asked and it stops by itself

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

	// nobody is asking for it any more: stop
	if ( performance.now() - lastAsked > GIVE_UP_AFTER ) return stop();

	const now = audio.currentTime;
	for ( let i = 0; i < 3; i ++ ) beep( now + i * 0.2 );

}

function stop() {

	clearInterval( timer );
	timer = null;

}

// on: whether it should be going right now. Call it every frame
export function setAlarm( on ) {

	if ( on ) lastAsked = performance.now();
	if ( on === ( timer !== null ) ) return;

	if ( ! on ) return stop();

	try {

		audio ??= new AudioContext();
		audio.resume();
		timer = setInterval( beeps, 1100 );
		beeps();

	} catch { /* no sound: the alarm still shows on screen */ }

}

export function alarmOn() {

	return timer !== null;

}

// switched off for good: the player is done with it (the cookies are out)
export function silenceAlarm() {

	stop();

}

// a hidden tab can't see the frames that would turn it off
document.addEventListener( 'visibilitychange', () => { if ( document.hidden ) stop(); } );
