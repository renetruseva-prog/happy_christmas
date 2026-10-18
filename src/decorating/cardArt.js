// the card itself, drawn in 2D: the front (the photo in a Christmas frame: a candy-cane border,
// holly, snowflakes, "Happy Christmas!") and the back (the player's own message, handwritten)
export const MESSAGE_LENGTH = 150;
export const DEFAULT_MESSAGE = 'Merry Christmas! I baked and decorated these cookies just for you.';

const CARD = { width: 1080, height: 1350 }; // (portrait 4:5: the shape Instagram likes)
const TITLE_FONT = '"Mountains of Christmas", "Georgia", serif';
const HAND_FONT = '"Caveat", "Segoe Print", "Bradley Hand", cursive';

function rounded( ctx, x, y, w, h, r ) {

	ctx.beginPath();
	ctx.moveTo( x + r, y );
	ctx.arcTo( x + w, y, x + w, y + h, r );
	ctx.arcTo( x + w, y + h, x, y + h, r );
	ctx.arcTo( x, y + h, x, y, r );
	ctx.arcTo( x, y, x + w, y, r );
	ctx.closePath();

}

// the candy-cane stripes round the edge
function candyCane( ctx, band ) {

	const { width: w, height: h } = CARD;
	ctx.save();
	ctx.beginPath();
	ctx.rect( 0, 0, w, h );
	ctx.rect( band, band, w - band * 2, h - band * 2 );
	ctx.clip( 'evenodd' );
	ctx.fillStyle = '#fffaf2';
	ctx.fillRect( 0, 0, w, h );
	ctx.strokeStyle = '#c4202e';
	ctx.lineWidth = 16;
	for ( let i = - h; i < w + h; i += 44 ) {

		ctx.beginPath();
		ctx.moveTo( i, 0 );
		ctx.lineTo( i + h, h );
		ctx.stroke();

	}

	ctx.restore();

}

function snowflake( ctx, x, y, r, alpha ) {

	ctx.save();
	ctx.translate( x, y );
	ctx.strokeStyle = `rgba(255, 255, 255, ${ alpha })`;
	ctx.lineWidth = Math.max( 1.5, r / 7 );
	ctx.lineCap = 'round';
	for ( let i = 0; i < 6; i ++ ) {

		ctx.rotate( Math.PI / 3 );
		ctx.beginPath();
		ctx.moveTo( 0, 0 );
		ctx.lineTo( 0, - r );
		ctx.moveTo( 0, - r * 0.55 );
		ctx.lineTo( - r * 0.25, - r * 0.8 );
		ctx.moveTo( 0, - r * 0.55 );
		ctx.lineTo( r * 0.25, - r * 0.8 );
		ctx.stroke();

	}

	ctx.restore();

}

// a sprig of holly: two leaves and three berries, turned by `angle`
function holly( ctx, x, y, size, angle ) {

	ctx.save();
	ctx.translate( x, y );
	ctx.rotate( angle );
	for ( const side of [ - 1, 1 ] ) {

		ctx.save();
		ctx.rotate( side * 0.55 );
		ctx.fillStyle = side < 0 ? '#1f6b3a' : '#2c8048';
		ctx.beginPath();
		// a leaf with its spiky edge: points along it, in and out
		const l = size;
		ctx.moveTo( 0, 0 );
		const points = 4;
		for ( let i = 1; i <= points; i ++ ) {

			const t = i / points;
			ctx.quadraticCurveTo( l * ( t - 0.12 ), - l * 0.32 * Math.sin( Math.PI * t ) * 0.5, l * t, - l * 0.26 * Math.sin( Math.PI * t ) - ( i < points ? l * 0.06 : 0 ) );

		}

		for ( let i = points - 1; i >= 0; i -- ) {

			const t = i / points;
			ctx.quadraticCurveTo( l * ( t + 0.12 ), l * 0.32 * Math.sin( Math.PI * t ) * 0.5, l * t, l * 0.26 * Math.sin( Math.PI * t ) + ( i > 0 ? l * 0.06 : 0 ) );

		}

		ctx.fill();
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo( 0, 0 );
		ctx.lineTo( l * 0.9, 0 );
		ctx.stroke();
		ctx.restore();

	}

	for ( const [ bx, by ] of [ [ - size * 0.1, - size * 0.06 ], [ size * 0.08, - size * 0.12 ], [ 0, size * 0.1 ] ] ) {

		const gradient = ctx.createRadialGradient( bx - size * 0.03, by - size * 0.03, 1, bx, by, size * 0.11 );
		gradient.addColorStop( 0, '#ff6b6b' );
		gradient.addColorStop( 1, '#a3121d' );
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.arc( bx, by, size * 0.11, 0, Math.PI * 2 );
		ctx.fill();

	}

	ctx.restore();

}

// some snowflakes, always in the same places (so the card looks the same each time)
function snow( ctx, area, count, seed ) {

	let s = seed;
	const random = () => ( s = ( s * 16807 ) % 2147483647 ) / 2147483647;
	for ( let i = 0; i < count; i ++ ) snowflake( ctx, area.x + random() * area.w, area.y + random() * area.h, 8 + random() * 16, 0.25 + random() * 0.45 );

}

// the front: the photo in its frame, under "Happy Christmas!"
export function drawFront( photo ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = CARD.width;
	canvas.height = CARD.height;
	const ctx = canvas.getContext( '2d' );
	const { width: w, height: h } = CARD;

	// deep red, darker at the edges
	const background = ctx.createRadialGradient( w / 2, h * 0.45, 100, w / 2, h / 2, h * 0.75 );
	background.addColorStop( 0, '#b42630' );
	background.addColorStop( 1, '#6e0f17' );
	ctx.fillStyle = background;
	ctx.fillRect( 0, 0, w, h );
	snow( ctx, { x: 40, y: 40, w: w - 80, h: h - 80 }, 46, 7 );
	candyCane( ctx, 26 );

	// the title
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	ctx.font = `700 118px ${ TITLE_FONT }`;
	ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
	ctx.fillText( 'Happy Christmas!', w / 2 + 4, 191 );
	const gold = ctx.createLinearGradient( 0, 95, 0, 195 );
	gold.addColorStop( 0, '#fff4c9' );
	gold.addColorStop( 1, '#f1c04d' );
	ctx.fillStyle = gold;
	ctx.fillText( 'Happy Christmas!', w / 2, 187 );

	// the photo, in a white mount with a gold line
	const pw = 900;
	const ph = Math.round( pw * photo.height / photo.width );
	const px = ( w - pw ) / 2;
	const py = 250;
	ctx.save();
	ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
	ctx.shadowBlur = 30;
	ctx.shadowOffsetY = 10;
	ctx.fillStyle = '#fffaf2';
	rounded( ctx, px - 22, py - 22, pw + 44, ph + 44, 30 );
	ctx.fill();
	ctx.restore();
	ctx.save();
	rounded( ctx, px, py, pw, ph, 18 );
	ctx.clip();
	ctx.drawImage( photo, px, py, pw, ph );
	ctx.restore();
	ctx.strokeStyle = '#d9a93a';
	ctx.lineWidth = 4;
	rounded( ctx, px - 9, py - 9, pw + 18, ph + 18, 24 );
	ctx.stroke();

	// holly on the corners of the frame
	holly( ctx, px - 6, py - 6, 120, - 0.75 );
	holly( ctx, px + pw + 6, py - 6, 120, - 2.4 );
	holly( ctx, px - 6, py + ph + 6, 100, 0.75 );
	holly( ctx, px + pw + 6, py + ph + 6, 100, 2.4 );

	// and underneath
	ctx.font = `600 54px ${ HAND_FONT }`;
	ctx.fillStyle = '#fff3e0';
	ctx.fillText( 'Baked & decorated with love', w / 2, py + ph + 100 );
	ctx.font = `500 22px system-ui, sans-serif`;
	ctx.fillStyle = 'rgba(255, 243, 224, 0.7)';
	ctx.fillText( 'COOKIE BAKING SIMULATOR', w / 2, h - 52 );

	return canvas;

}

// the words wrapped to fit `width`
function wrap( ctx, text, width ) {

	const lines = [];
	for ( const paragraph of text.split( '\n' ) ) {

		let line = '';
		for ( const word of paragraph.split( /\s+/ ) ) {

			const next = line ? `${ line } ${ word }` : word;
			if ( ctx.measureText( next ).width > width && line ) {

				lines.push( line );
				line = word;

			} else line = next;

		}

		lines.push( line );

	}

	return lines;

}

// the back: their message, handwritten
export function drawBack( message ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = CARD.width;
	canvas.height = CARD.height;
	const ctx = canvas.getContext( '2d' );
	const { width: w, height: h } = CARD;

	// cream paper
	ctx.fillStyle = '#fbf3e4';
	ctx.fillRect( 0, 0, w, h );
	ctx.fillStyle = 'rgba(160, 110, 60, 0.05)';
	for ( let y = 0; y < h; y += 6 ) ctx.fillRect( 0, y, w, 2 );
	candyCane( ctx, 26 );

	holly( ctx, 150, 160, 120, - 0.4 );
	holly( ctx, w - 150, h - 170, 120, 2.7 );

	// the message, as big as fits
	const text = ( message || '' ).trim() || DEFAULT_MESSAGE;
	ctx.textAlign = 'center';
	ctx.fillStyle = '#5a2a16';
	let size = 92;
	let lines;
	do {

		ctx.font = `600 ${ size }px ${ HAND_FONT }`;
		lines = wrap( ctx, text, w - 260 );
		size -= 4;

	} while ( ( lines.length * size * 1.25 > h - 520 || lines.some( ( l ) => ctx.measureText( l ).width > w - 220 ) ) && size > 36 );

	const lineHeight = size * 1.28;
	let y = h / 2 - ( lines.length - 1 ) * lineHeight / 2 + size * 0.3;
	for ( const line of lines ) {

		ctx.fillText( line, w / 2, y );
		y += lineHeight;

	}

	ctx.font = `700 64px ${ TITLE_FONT }`;
	ctx.fillStyle = '#b3202a';
	ctx.fillText( 'Happy Christmas!', w / 2, h - 150 );
	ctx.font = `500 22px system-ui, sans-serif`;
	ctx.fillStyle = 'rgba(90, 42, 22, 0.55)';
	ctx.fillText( 'COOKIE BAKING SIMULATOR', w / 2, h - 52 );
	return canvas;

}

// the fonts the card is written in (from Google Fonts: see index.html); a moment's wait at most
export function cardFonts() {

	const wait = Promise.all( [ `700 60px "Mountains of Christmas"`, `600 60px "Caveat"` ].map( ( f ) => document.fonts.load( f ) ) );
	return Promise.race( [ wait, new Promise( ( resolve ) => setTimeout( resolve, 2500 ) ) ] ).catch( () => {} );

}

// png for what has to stay lossless (the clipboard), jpeg for sending: several times smaller, so
// AirDrop and the share sheet don't spend ages moving a picture of a few megabytes
export function toBlob( canvas, type = 'image/png' ) {

	return new Promise( ( resolve ) => canvas.toBlob( resolve, type, 0.9 ) );

}
