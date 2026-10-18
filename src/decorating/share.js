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
// the pictures to send, made as soon as the card is drawn (not when "share" is pressed: the wait
// made the share sheet slow to come up, and a browser only lets a press open it right away)
let frontFile = null;
let backFile = null;
let frontPng = null;
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

function jpegFile( canvas, name ) {

	return toBlob( canvas, 'image/jpeg' ).then( ( blob ) => new File( [ blob ], name, { type: 'image/jpeg' } ) );

}

function drawMessage() {

	back = drawBack( message.value );
	showCanvas( backImage, back );
	backFile = jpegFile( back, 'happy-christmas-card-back.jpg' );

}

function turn( toBack ) {

	flip.classList.toggle( 'turned', toBack );
	document.getElementById( 'card-turn' ).textContent = toBack ? 'Show the front' : 'Show the back';

}

function files() {

	return Promise.all( [ frontFile, backFile ] );

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
async function shareCard( frontOnly = false ) {

	if ( ! frontFile ) return; // (the card isn't drawn yet)
	say( 'Getting your card ready…' );
	const [ cardFront, cardBack ] = await files();
	const text = `${ message.value.trim() || DEFAULT_MESSAGE } Happy Christmas!`;
	const both = { files: [ cardFront, cardBack ], title: 'Happy Christmas!', text };
	const one = { files: [ cardFront ], title: 'Happy Christmas!', text };
	try {

		if ( ! frontOnly && navigator.canShare?.( both ) ) await navigator.share( both );
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

// Facebook and Instagram can't be handed a picture (or told which friend to send it to) by a web
// page: that takes their own apps. So on a phone or tablet the share sheet does it (pick the app, then
// Feed or Stories, or a friend). On a computer the card goes on the clipboard (or downloads), and
// the right page opens: a new post, or the messages, where they pick the friend and paste it
const SITES = {
	facebook: { name: 'Facebook', photo: 'https://www.facebook.com/', message: 'https://www.messenger.com/' },
	instagram: { name: 'Instagram', photo: 'https://www.instagram.com/', message: 'https://www.instagram.com/direct/inbox/' },
};

function touchDevice() {

	return navigator.maxTouchPoints > 0 && !! navigator.canShare;

}

async function shareTo( site, mode ) {

	if ( ! frontFile ) return;
	const { name, [ mode ]: url } = SITES[ site ];
	const app = mode === 'message' && site === 'facebook' ? 'Messenger' : name;
	if ( touchDevice() ) {

		say( mode === 'message' ? `Pick ${ app } from the list, then the friend to send it to.` : `Pick ${ name } from the list, then Feed or Stories.` );
		return shareCard( true ); // (the front alone: that's the picture Instagram and Facebook take)

	}

	window.open( url, '_blank', 'noopener' ); // (straight away: a page only gets to open one from a press)
	const where = mode === 'message' ? 'open a chat with a friend' : 'start a new post';
	try {

		await navigator.clipboard.write( [ new ClipboardItem( { 'image/png': frontPng } ) ] );
		say( `${ app } is open: ${ where } and paste your card (Ctrl or ⌘ + V).` );

	} catch {

		await downloadCard();
		say( `${ app } is open, and your card is downloading: ${ where } and add it from there.` );

	}

}

async function copyCard() {

	try {

		await navigator.clipboard.write( [ new ClipboardItem( { 'image/png': frontPng } ) ] );
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
	document.getElementById( 'share-menu' ).hidden = true;
	message.value = saved().slice( 0, MESSAGE_LENGTH );
	count.textContent = `${ message.value.length }/${ MESSAGE_LENGTH }`;

	await cardFonts();
	const photo = await snapCookies( cookies );
	front = drawFront( photo );
	showCanvas( frontImage, front );
	frontFile = jpegFile( front, 'happy-christmas-card.jpg' );
	frontPng = toBlob( front );
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
	// "Share your card" opens the list of where to send it
	const menu = document.getElementById( 'share-menu' );
	const showMenu = ( on ) => {

		menu.hidden = ! on;
		shareButton.setAttribute( 'aria-expanded', String( on ) );

	};

	if ( ! navigator.canShare ) document.getElementById( 'card-native' ).hidden = true; // (no share sheet in this browser)
	shareButton.addEventListener( 'click', () => showMenu( menu.hidden ) );
	window.addEventListener( 'pointerdown', ( e ) => { if ( ! e.target.closest( '.share-drop' ) ) showMenu( false ); } ); // (a click elsewhere closes it)
	menu.addEventListener( 'click', ( e ) => { if ( e.target.closest( 'button' ) ) showMenu( false ); } );
	document.getElementById( 'card-native' ).addEventListener( 'click', () => shareCard() );
	for ( const item of document.querySelectorAll( '#share-menu [data-site]' ) ) item.addEventListener( 'click', () => shareTo( item.dataset.site, item.dataset.mode ) );
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
