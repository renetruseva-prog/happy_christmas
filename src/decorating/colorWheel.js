// the icing's colour picker: a colour wheel (the angle is the colour, the distance from the middle
// is how strong it is), a slider for how light or dark, and a row of ready-made colours.
// The colour is held as hue, saturation and value (0..1 each).

const PRESETS = [ '#ffffff', '#f7b7cf', '#e0314b', '#ff8a2a', '#ffd23f', '#5cc46a', '#4aa8e8', '#8e5bd6', '#7a4a2b' ];

function toRgb( h, s, v ) {

	const f = ( n ) => {

		const k = ( n + h * 6 ) % 6;
		return v - v * s * Math.max( 0, Math.min( k, 4 - k, 1 ) );

	};
	return [ f( 5 ), f( 3 ), f( 1 ) ].map( ( c ) => Math.round( c * 255 ) );

}

function toHsv( hex ) {

	const [ r, g, b ] = [ 1, 3, 5 ].map( ( i ) => parseInt( hex.slice( i, i + 2 ), 16 ) / 255 );
	const max = Math.max( r, g, b );
	const d = max - Math.min( r, g, b );
	let h = 0;
	if ( d > 0 ) {

		if ( max === r ) h = ( ( g - b ) / d + 6 ) % 6;
		else if ( max === g ) h = ( b - r ) / d + 2;
		else h = ( r - g ) / d + 4;

	}

	return { h: h / 6, s: max === 0 ? 0 : d / max, v: max };

}

const hex = ( [ r, g, b ] ) => `#${ [ r, g, b ].map( ( c ) => c.toString( 16 ).padStart( 2, '0' ) ).join( '' ) }`;

// canvas: the wheel, shade: a range input, swatches: where the ready-made colours go, onChange( '#rrggbb' )
export function colorWheel( { canvas, shade, swatches, preview, label, onChange } ) {

	const size = canvas.width;
	const half = size / 2;
	const ctx = canvas.getContext( '2d' );
	let color = { h: 0.97, s: 0.45, v: 1 };

	// the wheel itself, drawn once at full brightness
	const disc = document.createElement( 'canvas' );
	disc.width = disc.height = size;
	const image = disc.getContext( '2d' ).createImageData( size, size );
	for ( let y = 0; y < size; y ++ ) {

		for ( let x = 0; x < size; x ++ ) {

			const dx = x + 0.5 - half;
			const dy = y + 0.5 - half;
			const d = Math.hypot( dx, dy ) / half;
			const at = ( y * size + x ) * 4;
			if ( d > 1 ) continue;
			const [ r, g, b ] = toRgb( ( Math.atan2( dy, dx ) / ( Math.PI * 2 ) + 1 ) % 1, d, 1 );
			image.data.set( [ r, g, b, 255 ], at );

		}

	}

	disc.getContext( '2d' ).putImageData( image, 0, 0 );

	function draw() {

		ctx.clearRect( 0, 0, size, size );
		ctx.drawImage( disc, 0, 0 );

		// darker as the shade slider goes down
		ctx.fillStyle = `rgba(0, 0, 0, ${ 1 - color.v })`;
		ctx.beginPath();
		ctx.arc( half, half, half, 0, Math.PI * 2 );
		ctx.fill();

		// where the colour is
		const angle = color.h * Math.PI * 2;
		const x = half + Math.cos( angle ) * color.s * half;
		const y = half + Math.sin( angle ) * color.s * half;
		ctx.lineWidth = size / 40;
		ctx.strokeStyle = '#fff';
		ctx.fillStyle = current();
		ctx.beginPath();
		ctx.arc( x, y, size / 22, 0, Math.PI * 2 );
		ctx.fill();
		ctx.stroke();
		ctx.lineWidth = size / 120;
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.stroke();

	}

	const current = () => hex( toRgb( color.h, color.s, color.v ) );

	function changed() {

		const value = current();
		draw();
		shade.value = Math.round( color.v * 100 );
		shade.style.setProperty( '--shade-from', '#000' );
		shade.style.setProperty( '--shade-to', hex( toRgb( color.h, color.s, 1 ) ) );
		preview.style.background = value;
		label.textContent = value;
		for ( const button of swatches.children ) button.classList.toggle( 'on', button.dataset.color === value );
		onChange( value );

	}

	function pick( e ) {

		const box = canvas.getBoundingClientRect();
		const dx = ( e.clientX - box.left ) / box.width * size - half;
		const dy = ( e.clientY - box.top ) / box.height * size - half;
		color.h = ( Math.atan2( dy, dx ) / ( Math.PI * 2 ) + 1 ) % 1;
		color.s = Math.min( 1, Math.hypot( dx, dy ) / half );
		changed();

	}

	canvas.addEventListener( 'pointerdown', ( e ) => {

		canvas.setPointerCapture( e.pointerId );
		pick( e );

	} );
	canvas.addEventListener( 'pointermove', ( e ) => { if ( canvas.hasPointerCapture( e.pointerId ) ) pick( e ); } );

	// the keyboard: arrows go round the wheel (left and right) and in and out (up and down)
	canvas.addEventListener( 'keydown', ( e ) => {

		const step = { ArrowLeft: [ - 0.02, 0 ], ArrowRight: [ 0.02, 0 ], ArrowUp: [ 0, 0.04 ], ArrowDown: [ 0, - 0.04 ] }[ e.key ];
		if ( ! step ) return;
		e.preventDefault();
		color.h = ( color.h + step[ 0 ] + 1 ) % 1;
		color.s = Math.min( 1, Math.max( 0, color.s + step[ 1 ] ) );
		changed();

	} );

	shade.addEventListener( 'input', () => {

		color.v = Math.max( 0.05, shade.value / 100 );
		changed();

	} );

	for ( const preset of PRESETS ) {

		const button = document.createElement( 'button' );
		button.type = 'button';
		button.dataset.color = preset;
		button.style.background = preset;
		button.title = preset;
		button.setAttribute( 'aria-label', `Icing colour ${ preset }` );
		button.addEventListener( 'click', () => {

			color = toHsv( preset );
			changed();

		} );
		swatches.append( button );

	}

	changed();
	return { color: current, set: ( value ) => { color = toHsv( value ); changed(); } };

}
