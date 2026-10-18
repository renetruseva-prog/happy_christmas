// the loading screen: a Christmas progress bar with the percentage, shown from the first moment (it's
// in index.html) until the kitchen is ready and the first picture is drawn.
//   setLoading( 0..1 )         how far along it is (it never goes back, and the bar glides there)
//   crawl( to, seconds )       for a wait that can't be measured (the GPU getting ready): the bar
//                              creeps towards `to`, so it never looks stuck
//   finishLoading()            fills the bar, then fades the screen out once a picture is on screen
const screen = document.getElementById( 'loading' );
const fill = screen?.querySelector( '.load-fill' );
const bar = screen?.querySelector( '.load-bar' );
const percent = document.getElementById( 'load-pct' );
const message = document.getElementById( 'load-msg' );
const errorText = document.getElementById( 'load-error' );

// what's going on, from how far along it is
const STAGES = [
	[ 0, 'Warming up the kitchen…' ],
	[ 0.1, 'Fetching the flour and sugar…' ],
	[ 0.5, 'Setting the table…' ],
	[ 0.7, 'Hanging the stockings…' ],
	[ 0.8, 'Preheating the oven…' ],
	[ 0.97, 'Ready for baking!' ],
];

let target = 0; // where it should be
let shown = 0; // where the bar is (it glides towards the target)
let crawling = null; // { to, rate } while a wait that can't be measured goes on
let last = performance.now();
let finished = false;

function render() {

	if ( ! screen ) return;
	const value = Math.round( shown * 100 );
	fill.style.width = `${ shown * 100 }%`;
	percent.textContent = `${ value }%`;
	bar.setAttribute( 'aria-valuenow', String( value ) );
	for ( const [ from, text ] of STAGES ) if ( shown >= from ) message.textContent = text;

}

function tick( now ) {

	const dt = Math.min( ( now - last ) / 1000, 0.1 );
	last = now;

	if ( crawling && target < crawling.to ) target = Math.min( crawling.to, target + crawling.rate * dt );
	shown += ( target - shown ) * ( 1 - Math.exp( - dt * 5 ) );
	if ( target - shown < 0.001 ) shown = target;
	render();
	if ( ! finished || shown < 1 ) requestAnimationFrame( tick );

}

export function setLoading( fraction ) {

	target = Math.max( target, Math.min( fraction, 1 ) );

}

export function crawl( to, seconds ) {

	crawling = { to, rate: Math.max( to - target, 0 ) / seconds };

}

export function finishLoading() {

	finished = true;
	crawling = null;
	target = 1;

	// a moment on 100%, once a picture of the kitchen is on the screen behind it
	const hide = () => {

		screen?.classList.add( 'done' );
		setTimeout( () => screen?.remove(), 1000 );

	};

	requestAnimationFrame( () => requestAnimationFrame( () => setTimeout( hide, 450 ) ) );

}

// if the kitchen can't open (usually: no WebGPU), say so instead of filling the bar forever
function failed( reason ) {

	if ( finished || ! errorText ) return;
	crawling = null;
	message.textContent = 'Oh no!';
	errorText.hidden = false;
	errorText.textContent = /gpu/i.test( String( reason ) )
		? 'This game needs a browser with WebGPU (a recent Chrome, Edge or Safari). Try one of those.'
		: 'The kitchen couldn\'t open. Try reloading the page; if it keeps happening, try a recent Chrome, Edge or Safari.';

}

window.addEventListener( 'unhandledrejection', ( e ) => failed( e.reason?.message ?? e.reason ) );
window.addEventListener( 'error', ( e ) => failed( e.message ) );

if ( screen ) requestAnimationFrame( tick );
