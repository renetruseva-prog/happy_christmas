// the game's sound: short effects and the background music, through one Web Audio context.
// Each sound is looked for as a file in public/audio/ (name.mp3, name.ogg or name.wav, see
// SOUNDS); if there isn't one, a small made-up sound plays instead, so the game always has sound.
// The music is public/audio/music.(mp3|ogg|wav), or a soft music box tune made up here.
// The browser only starts sound after a click or key press, so the context wakes up on the first
// one. A panel on the left sets music and sounds apart (on/off and volume, remembered), and
// everything pauses when the tab is hidden.
//   play( 'pop' )               one effect         loop( 'mixer', true/false, rate )   a sound that goes on
// (the smoke alarm, baking/alarm.js, has its own beeps)

const EXTENSIONS = [ 'mp3', 'ogg', 'wav' ];
const KEY = 'happy-christmas-sound';
const MUSIC_SCALE = 0.5; // the music slider's full volume is this loud, so it sits under the effects

// made-up sounds for when there's no file: ( audio, at, out ) schedules them on `out`
function tone( a, out, { at, freq, to = freq, length = 0.15, type = 'sine', volume = 0.3, attack = 0.005 } ) {

	const osc = a.createOscillator();
	const gain = a.createGain();
	osc.type = type;
	osc.frequency.setValueAtTime( freq, at );
	osc.frequency.exponentialRampToValueAtTime( to, at + length );
	gain.gain.setValueAtTime( 0, at );
	gain.gain.linearRampToValueAtTime( volume, at + attack );
	gain.gain.exponentialRampToValueAtTime( 0.0001, at + length );
	osc.connect( gain ).connect( out );
	osc.start( at );
	osc.stop( at + length + 0.02 );

}

function noise( a, out, { at, length = 0.2, volume = 0.3, from = 4000, to = 800 } ) {

	const buffer = a.createBuffer( 1, Math.ceil( a.sampleRate * length ), a.sampleRate );
	const data = buffer.getChannelData( 0 );
	for ( let i = 0; i < data.length; i ++ ) data[ i ] = Math.random() * 2 - 1;
	const source = a.createBufferSource();
	source.buffer = buffer;
	const filter = a.createBiquadFilter();
	filter.type = 'bandpass';
	filter.frequency.setValueAtTime( from, at );
	filter.frequency.exponentialRampToValueAtTime( to, at + length );
	const gain = a.createGain();
	gain.gain.setValueAtTime( volume, at );
	gain.gain.exponentialRampToValueAtTime( 0.0001, at + length );
	source.connect( filter ).connect( gain ).connect( out );
	source.start( at );

}

// name: { synth( audio, at, out ) for the made-up version, loop: true for one that goes on }
export const SOUNDS = {
	pick: { synth: ( a, at, out ) => tone( a, out, { at, freq: 500, to: 800, length: 0.08, volume: 0.15 } ) },
	drop: { synth: ( a, at, out ) => { tone( a, out, { at, freq: 200, to: 70, length: 0.18, volume: 0.4 } ); noise( a, out, { at, length: 0.25, volume: 0.15 } ); } },
	egg_crack: { synth: ( a, at, out ) => { noise( a, out, { at, length: 0.08, volume: 0.35, from: 5000, to: 1500 } ); noise( a, out, { at: at + 0.12, length: 0.12, volume: 0.35, from: 4000, to: 800 } ); } },
	shatter: { synth: ( a, at, out ) => { noise( a, out, { at, length: 0.25, volume: 0.4, from: 9000, to: 2500 } ); tone( a, out, { at, freq: 2400, to: 1200, length: 0.15, volume: 0.1, type: 'triangle' } ); } },
	thud: { synth: ( a, at, out ) => tone( a, out, { at, freq: 120, to: 40, length: 0.25, volume: 0.5 } ) },
	cut: { synth: ( a, at, out ) => { tone( a, out, { at, freq: 300, to: 90, length: 0.12, volume: 0.35, type: 'triangle' } ); noise( a, out, { at, length: 0.1, volume: 0.2, from: 6000, to: 2000 } ); } },
	tray: { synth: ( a, at, out ) => { tone( a, out, { at, freq: 1200, to: 900, length: 0.25, volume: 0.15, type: 'triangle' } ); tone( a, out, { at, freq: 1800, to: 1300, length: 0.2, volume: 0.08, type: 'triangle' } ); } },
	door: { synth: ( a, at, out ) => { noise( a, out, { at, length: 0.35, volume: 0.15, from: 300, to: 150 } ); tone( a, out, { at, freq: 90, to: 60, length: 0.3, volume: 0.3 } ); } },
	ding: { synth: ( a, at, out ) => { tone( a, out, { at, freq: 1568, length: 0.9, volume: 0.25 } ); tone( a, out, { at: at + 0.02, freq: 2349, length: 0.6, volume: 0.1 } ); } },
	success: { synth: ( a, at, out ) => [ 523, 659, 784, 1047 ].forEach( ( f, i ) => tone( a, out, { at: at + i * 0.11, freq: f, length: 0.5, volume: 0.22, type: 'triangle' } ) ) },
	fail: { synth: ( a, at, out ) => [ 392, 330, 262 ].forEach( ( f, i ) => tone( a, out, { at: at + i * 0.18, freq: f, length: 0.4, volume: 0.22, type: 'sawtooth' } ) ) },
	squeeze: { synth: ( a, at, out ) => noise( a, out, { at, length: 0.3, volume: 0.12, from: 1200, to: 2500 } ) },
	click: { synth: ( a, at, out ) => tone( a, out, { at, freq: 900, to: 600, length: 0.04, volume: 0.15, type: 'square' } ) },
	// a motor: made up of a low buzz (see loop())
	mixer: { loop: true, synth: ( a, out ) => {

		const osc = a.createOscillator();
		osc.type = 'sawtooth';
		osc.frequency.value = 90;
		const filter = a.createBiquadFilter();
		filter.type = 'lowpass';
		filter.frequency.value = 500;
		osc.connect( filter ).connect( out );
		osc.start();
		return { source: osc, rate: osc.frequency, base: 90 };

	} },
};

let ctx = null;
let sfxGain = null; // everything but the music
let musicGain = null;
let musicElement = null; // the music file, streamed (it's minutes long) and looped
// what the player set (saved): on or off and 0..1, for the music and for the effects
const settings = { music: { on: true, volume: 0.5 }, sfx: { on: true, volume: 0.8 } };
const buffers = {}; // decoded files: name -> AudioBuffer, or false when there isn't one
const loops = {}; // running loops: name -> { gain, handle, source }

try {

	const saved = JSON.parse( localStorage.getItem( KEY ) );
	for ( const bus of [ 'music', 'sfx' ] ) {

		if ( typeof saved?.[ bus ]?.on === 'boolean' ) settings[ bus ].on = saved[ bus ].on;
		if ( typeof saved?.[ bus ]?.volume === 'number' ) settings[ bus ].volume = Math.min( 1, Math.max( 0, saved[ bus ].volume ) );

	}

} catch { /* nothing saved, or storage blocked */ }

// the address of public/audio/name.ext, for the first extension that exists
async function findFile( name ) {

	for ( const ext of EXTENSIONS ) {

		try {

			const url = `${ import.meta.env.BASE_URL }audio/${ name }.${ ext }`;
			const response = await fetch( url, { method: 'HEAD' } );
			if ( response.ok && ! ( response.headers.get( 'content-type' ) ?? '' ).includes( 'text/html' ) ) return url;

		} catch { /* try the next */ }

	}

	return null;

}

async function fetchBuffer( name ) {

	for ( const ext of EXTENSIONS ) {

		try {

			const response = await fetch( `${ import.meta.env.BASE_URL }audio/${ name }.${ ext }` );
			if ( ! response.ok || ( response.headers.get( 'content-type' ) ?? '' ).includes( 'text/html' ) ) continue; // (the dev server answers a missing file with the page)
			return await ctx.decodeAudioData( await response.arrayBuffer() );

		} catch { /* not a sound file: try the next */ }

	}

	return false;

}

function load( name ) {

	buffers[ name ] ??= fetchBuffer( name ).then( ( b ) => ( buffers[ name ] = b ) );
	return buffers[ name ];

}

function source( buffer, out, { loop = false, rate = 1 } = {} ) {

	const s = ctx.createBufferSource();
	s.buffer = buffer;
	s.loop = loop;
	s.playbackRate.value = rate;
	s.connect( out );
	s.start();
	return s;

}

export function play( name, { volume = 1, rate = 1 } = {} ) {

	if ( ! ctx || ! settings.sfx.on || ctx.state !== 'running' ) return;
	const gain = ctx.createGain();
	gain.gain.value = volume;
	gain.connect( sfxGain );
	const buffer = buffers[ name ];
	if ( buffer instanceof AudioBuffer ) source( buffer, gain, { rate } );
	else if ( buffer === false ) SOUNDS[ name ]?.synth( ctx, ctx.currentTime, gain );
	else load( name ).then( () => play( name, { volume, rate } ) ); // (still loading: once it has)

}

// a sound that goes on while it's wanted: loop( 'mixer', true, speed ), loop( 'mixer', false )
export function loop( name, on, rate = 1 ) {

	if ( ! ctx ) return;
	let l = loops[ name ];
	if ( ! on || ! settings.sfx.on || ctx.state !== 'running' ) {

		if ( l ) { l.gain.gain.setTargetAtTime( 0, ctx.currentTime, 0.08 ); }
		return;

	}

	if ( ! l ) {

		const buffer = buffers[ name ];
		if ( buffer === undefined ) { load( name ); return; }
		const gain = ctx.createGain();
		gain.gain.value = 0;
		gain.connect( sfxGain );
		l = loops[ name ] = { gain };
		if ( buffer instanceof AudioBuffer ) {

			l.source = source( buffer, gain, { loop: true, rate } );
			l.rate = l.source.playbackRate;
			l.base = 1;

		} else {

			Object.assign( l, SOUNDS[ name ].synth( ctx, gain ) );

		}

	}

	l.gain.gain.setTargetAtTime( 0.35, ctx.currentTime, 0.08 );
	l.rate?.setTargetAtTime( l.base * rate, ctx.currentTime, 0.1 );

}

// ---------- the music ----------
// a music box tune made up of arpeggios over four chords, scheduled a little ahead, forever
const CHORDS = [ [ 262, 330, 392, 523 ], [ 220, 262, 330, 440 ], [ 175, 220, 262, 349 ], [ 196, 247, 294, 392 ] ];
let musicTimer = null;
let musicStep = 0;
let musicAt = 0;

function scheduleMusicBox() {

	while ( musicAt < ctx.currentTime + 1 ) {

		const chord = CHORDS[ Math.floor( musicStep / 8 ) % CHORDS.length ];
		const i = musicStep % 8;
		const note = chord[ [ 0, 1, 2, 3, 2, 1, 2, 1 ][ i ] ] * ( i === 7 && Math.random() < 0.3 ? 2 : 1 );
		tone( ctx, musicGain, { at: musicAt, freq: note * 2, length: 1.2, volume: 0.12, type: 'sine' } );
		if ( i === 0 ) tone( ctx, musicGain, { at: musicAt, freq: chord[ 0 ] / 2, length: 2, volume: 0.1, type: 'triangle' } );
		musicAt += 0.4;
		musicStep ++;

	}

}

async function startMusic() {

	const url = await findFile( 'music' );
	if ( url ) {

		// streamed and looped by the browser: the file is minutes long, so it isn't decoded up front
		musicElement = new Audio( url );
		musicElement.loop = true;
		ctx.createMediaElementSource( musicElement ).connect( musicGain );
		if ( ! document.hidden ) musicElement.play().catch( () => {} ); // (if the browser says no, the next click or key press tries again)

	} else {

		musicAt = ctx.currentTime + 0.1;
		scheduleMusicBox();
		musicTimer = setInterval( () => { if ( ctx.state === 'running' ) scheduleMusicBox(); else musicAt = ctx.currentTime + 0.1; }, 250 );

	}

}

// ---------- the settings panel (left side): on/off and volume, for music and effects ----------
const panel = document.getElementById( 'sound-panel' );

function apply() {

	if ( ctx ) {

		musicGain.gain.setTargetAtTime( settings.music.on ? settings.music.volume * MUSIC_SCALE : 0, ctx.currentTime, 0.05 );
		sfxGain.gain.setTargetAtTime( settings.sfx.on ? settings.sfx.volume : 0, ctx.currentTime, 0.05 );

	}

	for ( const bus of [ 'music', 'sfx' ] ) {

		const row = panel?.querySelector( `[data-bus="${ bus }"]` );
		if ( ! row ) continue;
		const { on, volume } = settings[ bus ];
		const button = row.querySelector( 'button' );
		button.textContent = bus === 'music' ? ( on && volume > 0 ? '🎶' : '🔕' ) : ! on ? '🔇' : volume === 0 ? '🔈' : '🔊';
		button.setAttribute( 'aria-pressed', String( on ) );
		button.title = `${ bus === 'music' ? 'Music' : 'Sounds' } ${ on ? 'on' : 'off' }`;
		row.querySelector( 'input' ).value = String( Math.round( volume * 100 ) );
		row.classList.toggle( 'off', ! on );

	}

}

function save() {

	try { localStorage.setItem( KEY, JSON.stringify( settings ) ); } catch { /* storage blocked */ }

}

function wake() {

	if ( ! ctx ) {

		ctx = new AudioContext();
		sfxGain = ctx.createGain();
		sfxGain.connect( ctx.destination );
		musicGain = ctx.createGain();
		musicGain.connect( ctx.destination );
		for ( const name of Object.keys( SOUNDS ) ) load( name );
		apply();
		startMusic();

	}

	if ( ctx.state === 'suspended' ) ctx.resume();
	if ( musicElement?.paused && ! document.hidden ) musicElement.play().catch( () => {} );

}

export function setSound( bus, { on, volume } ) {

	if ( on !== undefined ) settings[ bus ].on = on;
	if ( volume !== undefined ) settings[ bus ].volume = volume;
	apply();
	save();

}

export function initAudio() {

	apply();
	for ( const type of [ 'pointerdown', 'keydown' ] ) window.addEventListener( type, wake, { passive: true } );
	for ( const row of panel?.querySelectorAll( '[data-bus]' ) ?? [] ) {

		const bus = row.dataset.bus;
		row.querySelector( 'button' ).addEventListener( 'click', () => {

			const on = ! settings[ bus ].on;
			// (turning it on from nothing gives it some volume)
			setSound( bus, { on, volume: on && settings[ bus ].volume === 0 ? 0.5 : undefined } );
			if ( bus === 'sfx' && on ) play( 'click' );

		} );
		row.querySelector( 'input' ).addEventListener( 'input', ( e ) => {

			const volume = Number( e.target.value ) / 100;
			setSound( bus, { volume, on: volume > 0 ? true : undefined } );

		} );
		row.querySelector( 'input' ).addEventListener( 'change', () => { if ( bus === 'sfx' ) play( 'click' ); } );

	}

	// M: everything off, or back on
	window.addEventListener( 'keydown', ( e ) => {

		if ( ( e.key !== 'm' && e.key !== 'M' ) || e.ctrlKey || e.metaKey || e.altKey ) return;
		const on = ! ( settings.music.on || settings.sfx.on );
		setSound( 'music', { on } );
		setSound( 'sfx', { on } );

	} );

	document.addEventListener( 'visibilitychange', () => {

		if ( ! ctx ) return;
		if ( document.hidden ) { ctx.suspend(); musicElement?.pause(); } else { ctx.resume(); musicElement?.play().catch( () => {} ); }

	} );

}
