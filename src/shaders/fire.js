// Fire shader
// Original Shadertoy: https://www.shadertoy.com/view/3tcBzH
// Original author: @febucci
// Ported from GLSL to three.js TSL for WebGPURenderer (TSL compiles to WGSL).
// Shadertoy shaders are CC BY-NC-SA 3.0 unless the author says otherwise.
//
// The original, in short: fractal value noise (5 octaves) scrolling upwards, cut into flame shapes
// by a gradient that fades from the bottom of the picture to the top. Where the noise is above the
// gradient it burns: bright yellow-orange in the middle, red at the edges, black outside.
//
// What's the same: rand, hermite, noise and pnoise are line-for-line the GLSL ones, and so is
// mainImage (colours, steps, speed, frequency). Shadertoy's inputs become uniforms:
//   iTime → time, iResolution → resolution, fragCoord → uv() × resolution
//
// What's added (marked "added" below), so it can live in the oven and react to the player:
//   mouse (0..1 on the fire, like iMouse) and hover (0..1): the flames lean towards the mouse and
//   reach up under it, heat (0..1): the fire is on (0 = out), flare: a burst of flame, fierce
//   (0..1): how hot the oven is set, which changes the whole character of the fire: a small calm
//   low fire at 0 (cool oven), and at 1 tall, fast and crazy, with many more tongues of flame,
//   a second layer of flame, a wobble, and a hotter, yellower core

import { Fn, float, vec2, vec3, fract, sin, dot, floor, mix, smoothstep, abs, uv } from 'three/tsl';

// float rand(vec2 co)
const rand = Fn( ( [ co ] ) => fract( sin( dot( co, vec2( 12.9898, 78.233 ) ) ).mul( 43758.5453 ) ) );

// float hermite(float t)
const hermite = Fn( ( [ t ] ) => t.mul( t ).mul( float( 3.0 ).sub( t.mul( 2.0 ) ) ) );

// float noise(vec2 co, float frequency): value noise, smoothly blended between random corners
const noise = Fn( ( [ co, frequency ] ) => {

	const v = vec2( co.x.mul( frequency ), co.y.mul( frequency ) );

	const ix1 = floor( v.x );
	const iy1 = floor( v.y );
	const ix2 = floor( v.x.add( 1.0 ) );
	const iy2 = floor( v.y.add( 1.0 ) );

	const fx = hermite( fract( v.x ) );
	const fy = hermite( fract( v.y ) );

	const fade1 = mix( rand( vec2( ix1, iy1 ) ), rand( vec2( ix2, iy1 ) ), fx );
	const fade2 = mix( rand( vec2( ix1, iy2 ) ), rand( vec2( ix2, iy2 ) ), fx );

	return mix( fade1, fade2, fy );

} );

// float pnoise(vec2 co, float freq, int steps, float persistence): octaves of noise added up.
// The GLSL loop runs a fixed number of times, so it's unrolled here while the shader is built
function pnoise( co, freq, steps, persistence ) {

	let value = float( 0.0 );
	let ampl = 1.0;
	let sum = 0.0;
	let f = float( freq ); // (a number, or a node: the fire changes it with the heat)
	for ( let i = 0; i < steps; i ++ ) {

		sum += ampl;
		value = value.add( noise( co, f ).mul( ampl ) );
		f = f.mul( 2.0 );
		ampl *= persistence;

	}

	return value.div( sum );

}

// the original's flame shapes and colours (mainImage, once the position, the gradient and the
// noise frequency are worked out): used once for the main flames, and again for a second layer
// of flames when it's very hot
function flame( pos, gradient, frequency, brighterColor, darkerColor ) {

	const gradientStep = 0.2;
	const middleColor = mix( brighterColor, darkerColor, 0.5 );

	const noiseTexel = pnoise( pos, frequency, 5, 0.5 );

	const firstStep = smoothstep( 0.0, noiseTexel, gradient );
	const darkerColorStep = smoothstep( 0.0, noiseTexel, gradient.sub( gradientStep ) );
	const darkerColorPath = firstStep.sub( darkerColorStep );
	// vec4 color = mix(brighterColor, darkerColor, darkerColorPath);
	let color = mix( brighterColor, darkerColor, darkerColorPath );

	const middleColorStep = smoothstep( 0.0, noiseTexel, gradient.sub( 0.2 * 2.0 ) );

	// color = mix(color, middleColor, ...); color = mix(vec4(0.0), color, firstStep);
	// (each step is a new node here: TSL's assign only works inside an Fn)
	color = mix( color, middleColor, darkerColorStep.sub( middleColorStep ) );
	return mix( vec3( 0.0 ), color, firstStep );

}

// mainImage: returns the fire's colour (black where there's no fire, so it can be added on top
// of what's behind it)
export function fire( { time, resolution, mouse, hover, heat, flare, fierce } ) {

	const fragCoord = uv().mul( resolution ); // (uv's y goes up, like Shadertoy's fragCoord)
	const st = fragCoord.div( resolution ); // "uv" in the original

	// added: the flames lean towards the mouse, more the higher up they are, and reach up
	// towards it: higher right under it
	const lean = mouse.x.sub( 0.5 ).mul( hover ).mul( st.y ).mul( 0.35 );
	const underMouse = float( 1.0 ).sub( smoothstep( 0.0, 0.3, abs( st.x.sub( mouse.x ) ) ) ).mul( hover );

	// added: how high they reach depends on the heat of the oven: low and small when it's cool,
	// to the top of the oven at full heat (and a burst higher when the door opens)
	const reach = mix( 0.45, 1.05, fierce ).add( underMouse.mul( 0.3 ) ).add( flare.mul( 0.6 ) );

	// float gradient = 1.0 - uv.y;  (added: divided by how far the flames reach)
	const gradient = float( 1.0 ).sub( st.y.div( reach ) );

	// added: more tongues of flame when it's hotter (the noise is finer), and they waver sideways
	const frequency = mix( 7.0, 14.0, fierce );
	const wobble = sin( st.y.mul( 38 ).add( time.mul( 7 ) ) ).mul( 0.012 ).mul( fierce.mul( fierce ) );

	// vec2 pos = fragCoord.xy / iResolution.x;  pos.y -= iTime * 0.3125;  (added: the lean, the wobble)
	const pos = vec2( fragCoord.x.div( resolution.x ).sub( lean ).add( wobble ), fragCoord.y.div( resolution.x ).sub( time.mul( 0.3125 ) ) );

	// the colours (the alpha in the original isn't shown on Shadertoy, so only the rgb is used);
	// added: yellower at the core when it's hot
	const brighterColor = mix( vec3( 1.0, 0.58, 0.07 ), vec3( 1.0, 0.78, 0.2 ), fierce.mul( 0.7 ) );
	// (and the edges are a warmer orange-red, not the original's crimson, which goes pink when it's bright)
	const darkerColor = mix( vec3( 1.0, 0.0, 0.15 ), vec3( 1.0, 0.22, 0.02 ), fierce );

	let color = flame( pos, gradient, frequency, brighterColor, darkerColor );

	// added: a second, finer layer of flames in front of the first, fading in above about 190
	// degrees, so a hot oven has a lot more going on
	const second = smoothstep( 0.25, 0.85, fierce );
	const pos2 = vec2( pos.x.mul( 1.15 ).add( 3.7 ), pos.y.mul( 1.3 ).add( 1.9 ).sub( time.mul( 0.12 ) ) );
	const gradient2 = float( 1.0 ).sub( st.y.div( reach.mul( 0.85 ) ) );
	color = color.add( flame( pos2, gradient2, frequency.mul( 1.3 ), brighterColor, darkerColor ).mul( second ).mul( 0.55 ) );

	// added: a quick flicker, wilder the hotter it is; and no heat, no fire
	const flicker = float( 1.0 ).sub( fierce.mul( 0.18 ).mul( sin( time.mul( 23 ) ).mul( sin( time.mul( 9.3 ) ).mul( 0.5 ).add( 0.5 ) ) ) );
	return color.mul( flicker ).mul( smoothstep( 0.0, 0.15, heat ) );

}
