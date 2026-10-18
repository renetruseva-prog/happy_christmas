// the "share the love" window: the Christmas card (see card.js), front and back (turn it over with
// a click), the message for the back (typed in, up to 150 characters, and drawn on the card as it's
// typed), and the ways to send it: the device's own share sheet (Instagram, Facebook, WhatsApp,
// messages, mail... whatever's on it), or a download, or a copy to paste into a post.
import { resetProgress } from '../core/progress.js';
import { snapCookies, drawFront, drawBack, cardFonts, toBlob, MESSAGE_LENGTH, DEFAULT_MESSAGE } from './card.js';

const KEY = 'happy-christmas-card-message';

const overlay = document.getElementById( 'share' );
const flip = document.getElementById( 'card-flip' );
const frontImage = document.getElementById( 'card-front' );
const backImage = document.getElementById( 'card-back' );
const message = document.getElementById( 'card-message' );
const count = document.getElementById( 'card-count' );
const status = document.getElementById( 'share-status' );
const shareButton = document.getElementById( 'card-share' );

let front = null; // the card's canvases
let back = null;
let redraw = 0;
let closed = () => {};

function say( text ) {

	status.textContent = text;

}

function saved() {

	try {

		return localStorage.getItem( KEY ) ?? DEFAULT_MESSAGE;

	} catch {

		return DEFAULT_MESSAGE;

	}

}

function remember( text ) {

	try {

		localStorage.setItem( KEY, text );

	} catch { /* it just won't be remembered */ }

}

function showCanvas( image, canvas ) {

	URL.revokeObjectURL( image.src );
	toBlob( canvas ).then( ( blob ) => { image.src = URL.createObjectURL( blob ); } );

}

function drawMessage() {

	back = drawBack( message.value );
	showCanvas( backImage, back );

}

function turn( toBack ) {

	flip.classList.toggle( 'turned', toBack );
	document.getElementById( 'card-turn' ).textContent = toBack ? 'Show the front' : 'Show the back';

}

async function files() {

	const [ f, b ] = await Promise.all( [ toBlob( front ), toBlob( back ) ] );
	return [ new File( [ f ], 'happy-christmas-card.png', { type: 'image/png' } ), new File( [ b ], 'happy-christmas-card-back.png', { type: 'image/png' } ) ];

}

function download( file ) {

	const link = document.createElement( 'a' );
	link.href = URL.createObjectURL( file );
	link.download = file.name;
	document.body.append( link );
	link.click();
	link.remove();
	setTimeout( () => URL.revokeObjectURL( link.href ), 4000 );

}

async function downloadCard() {

	for ( const file of await files() ) download( file );
	say( 'Downloading the front and the back of your card: post them on Instagram, Facebook or anywhere you like.' );

}

// the device's share sheet: both sides if it can take two pictures, otherwise the front with the
// message as the text; if there's no share sheet, the card's downloaded instead
async function shareCard() {

	say( 'Getting your card ready…' );
	const [ cardFront, cardBack ] = await files();
	const text = `${ message.value.trim() || DEFAULT_MESSAGE } Happy Christmas!`;
	const both = { files: [ cardFront, cardBack ], title: 'Happy Christmas!', text };
	const one = { files: [ cardFront ], title: 'Happy Christmas!', text };
	try {

		if ( navigator.canShare?.( both ) ) await navigator.share( both );
		else if ( navigator.canShare?.( one ) ) await navigator.share( one );
		else {

			await downloadCard();
			say( 'This browser can\'t share pictures directly, so your card is downloading instead: post it on Instagram, Facebook or WhatsApp from there.' );
			return;

		}

		// the share sheet says it went through
		say( 'Sent successfully!' );

	} catch {

		// closed without sharing, or it went wrong: it wasn't sent
		say( 'Sharing failed - try again' );

	}

}

async function copyCard() {

	try {

		await navigator.clipboard.write( [ new ClipboardItem( { 'image/png': toBlob( front ) } ) ] );
		say( 'Copied! Paste it into a post or a message.' );

	} catch {

		say( 'Copying pictures doesn\'t work in this browser: use Download instead.' );

	}

}

// open it, with these cookies (the decorated ones) on the plate; closed(): back to decorating
export async function openShare( cookies, onClose = () => {} ) {

	closed = onClose;
	overlay.classList.add( 'show', 'snapping' );
	turn( false );
	say( '' );
	message.value = saved().slice( 0, MESSAGE_LENGTH );
	count.textContent = `${ message.value.length }/${ MESSAGE_LENGTH }`;

	await cardFonts();
	const photo = await snapCookies( cookies );
	front = drawFront( photo );
	showCanvas( frontImage, front );
	drawMessage();
	overlay.classList.remove( 'snapping' );
	shareButton.focus();

}

function close() {

	overlay.classList.remove( 'show' );
	closed();

}

export function initShare() {

	message.maxLength = MESSAGE_LENGTH;
	message.addEventListener( 'input', () => {

		count.textContent = `${ message.value.length }/${ MESSAGE_LENGTH }`;
		remember( message.value );
		turn( true ); // (so they can see it going on the back)
		clearTimeout( redraw );
		redraw = setTimeout( drawMessage, 120 );

	} );

	flip.addEventListener( 'click', () => turn( ! flip.classList.contains( 'turned' ) ) );
	document.getElementById( 'card-turn' ).addEventListener( 'click', () => turn( ! flip.classList.contains( 'turned' ) ) );
	shareButton.addEventListener( 'click', shareCard );
	document.getElementById( 'card-download' ).addEventListener( 'click', downloadCard );
	document.getElementById( 'card-copy' ).addEventListener( 'click', copyCard );
	document.getElementById( 'share-close' ).addEventListener( 'click', close );
	document.getElementById( 'share-restart' ).addEventListener( 'click', () => resetProgress() );
	window.addEventListener( 'keydown', ( e ) => { if ( e.key === 'Escape' && overlay.classList.contains( 'show' ) && document.activeElement !== message ) close(); } );

	// (no copying pictures in this browser: no button for it)
	if ( ! window.ClipboardItem || ! navigator.clipboard?.write ) document.getElementById( 'card-copy' ).hidden = true;

}

export function sharing() {

	return overlay.classList.contains( 'show' );

}
