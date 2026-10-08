// Curling smoke shader
// Original Shadertoy: https://www.shadertoy.com/view/MsdGWn
// Original author: @iq
// Ported from GLSL to three.js TSL for WebGPURenderer (TSL compiles to WGSL).
// Shadertoy shaders are CC BY-NC-SA 3.0 unless the author says otherwise.
//
// The simplex noise inside is Ian McEwan / Ashima Arts' webgl-noise (MIT License, Copyright (C)
// 2011 Ashima Arts, https://github.com/ashima/webgl-noise).
//
// The original, in short: simplex noise in layers (fbm), sampled at a point that's first pushed
// around by the noise itself a couple of times ("swirl"), so it curls like smoke. Time moves
// through the noise's third dimension, and the result is raised to the 4th power for contrast.
//
// What's the same: simplex, fbm3, fbm5, getNoise and mainImage are line-for-line the GLSL ones,
// with the same constants. Shadertoy's inputs become uniforms: iTime → time, and
// fragCoord / iResolution → uv() (the plane's own 0..1 coordinates, the same thing).
//
// What's added (marked "added" below), so it can rise out of the oven and react to the player:
//   rise: the smoke drifts upwards, mouse (0..1 on the smoke, like iMouse) and hover (0..1): the
//   smoke is pushed away from the mouse and thins out around it, like waving it away

import { Fn, float, vec2, vec3, vec4, floor, dot, step, min, max, abs, uv, exp, normalize, length } from 'three/tsl';

const noiseSwirlSteps = 2;
const noiseSwirlValue = 1.0;
const noiseSwirlStepValue = noiseSwirlValue / noiseSwirlSteps;

const noiseScale = 2.0;
const noiseTimeScale = 0.1;

// ---------- Ashima Arts' simplex noise ----------
// vec3/vec4 mod289(x)
const mod289 = ( x ) => x.sub( floor( x.mul( 1.0 / 289.0 ) ).mul( 289.0 ) );

// vec4 permute(vec4 x)
const permute = ( x ) => mod289( x.mul( 34.0 ).add( 1.0 ).mul( x ) );

// vec4 taylorInvSqrt(vec4 r)
const taylorInvSqrt = ( r ) => float( 1.79284291400159 ).sub( r.mul( 0.85373472095314 ) );

// float simplex(vec3 v)
const simplex = Fn( ( [ v ] ) => {

	const C = vec2( 1.0 / 6.0, 1.0 / 3.0 );
	const D = vec4( 0.0, 0.5, 1.0, 2.0 );

	// First corner
	const i = floor( v.add( dot( v, C.yyy ) ) );
	const x0 = v.sub( i ).add( dot( i, C.xxx ) );

	// Other corners
	const g = step( x0.yzx, x0.xyz );
	const l = float( 1.0 ).sub( g );
	const i1 = min( g.xyz, l.zxy );
	const i2 = max( g.xyz, l.zxy );

	const x1 = x0.sub( i1 ).add( C.xxx );
	const x2 = x0.sub( i2 ).add( C.yyy ); // 2.0*C.x = 1/3 = C.y
	const x3 = x0.sub( D.yyy ); // -1.0+3.0*C.x = -0.5 = -D.y

	// Permutations
	const im = mod289( i );
	const p = permute( permute( permute(
		im.z.add( vec4( 0.0, i1.z, i2.z, 1.0 ) ) )
		.add( im.y ).add( vec4( 0.0, i1.y, i2.y, 1.0 ) ) )
		.add( im.x ).add( vec4( 0.0, i1.x, i2.x, 1.0 ) ) );

	// Gradients: 7x7 points over a square, mapped onto an octahedron.
	// The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
	const n_ = 0.142857142857; // 1.0/7.0
	const ns = D.wyz.mul( n_ ).sub( D.xzx );

	const j = p.sub( floor( p.mul( ns.z ).mul( ns.z ) ).mul( 49.0 ) ); //  mod(p,7*7)

	const x_ = floor( j.mul( ns.z ) );
	const y_ = floor( j.sub( x_.mul( 7.0 ) ) ); // mod(j,N)

	const x = x_.mul( ns.x ).add( ns.yyyy );
	const y = y_.mul( ns.x ).add( ns.yyyy );
	const h = float( 1.0 ).sub( abs( x ) ).sub( abs( y ) );

	const b0 = vec4( x.xy, y.xy );
	const b1 = vec4( x.zw, y.zw );

	const s0 = floor( b0 ).mul( 2.0 ).add( 1.0 );
	const s1 = floor( b1 ).mul( 2.0 ).add( 1.0 );
	const sh = step( h, vec4( 0.0 ) ).negate();

	const a0 = b0.xzyw.add( s0.xzyw.mul( sh.xxyy ) );
	const a1 = b1.xzyw.add( s1.xzyw.mul( sh.zzww ) );

	const p0 = vec3( a0.xy, h.x );
	const p1 = vec3( a0.zw, h.y );
	const p2 = vec3( a1.xy, h.z );
	const p3 = vec3( a1.zw, h.w );

	// Normalise gradients
	const norm = taylorInvSqrt( vec4( dot( p0, p0 ), dot( p1, p1 ), dot( p2, p2 ), dot( p3, p3 ) ) );
	const n0 = p0.mul( norm.x );
	const n1 = p1.mul( norm.y );
	const n2 = p2.mul( norm.z );
	const n3 = p3.mul( norm.w );

	// Mix final noise value
	const m0 = max( float( 0.6 ).sub( vec4( dot( x0, x0 ), dot( x1, x1 ), dot( x2, x2 ), dot( x3, x3 ) ) ), 0.0 );
	const m = m0.mul( m0 );
	return float( 42.0 ).mul( dot( m.mul( m ), vec4( dot( n0, x0 ), dot( n1, x1 ), dot( n2, x2 ), dot( n3, x3 ) ) ) );

} );

// ---------- the smoke ----------
// float fbm3(vec3 v)
function fbm3( v ) {

	let result = simplex( v );
	result = result.add( simplex( v.mul( 2.0 ) ).div( 2.0 ) );
	result = result.add( simplex( v.mul( 4.0 ) ).div( 4.0 ) );
	return result.div( 1.0 + 1.0 / 2.0 + 1.0 / 4.0 );

}

// float fbm5(vec3 v)
function fbm5( v ) {

	let result = simplex( v );
	result = result.add( simplex( v.mul( 2.0 ) ).div( 2.0 ) );
	result = result.add( simplex( v.mul( 4.0 ) ).div( 4.0 ) );
	result = result.add( simplex( v.mul( 8.0 ) ).div( 8.0 ) );
	result = result.add( simplex( v.mul( 16.0 ) ).div( 16.0 ) );
	return result.div( 1.0 + 1.0 / 2.0 + 1.0 / 4.0 + 1.0 / 8.0 + 1.0 / 16.0 );

}

// float getNoise(vec3 v). The GLSL loop runs a fixed number of times, so it's unrolled here
// while the shader is built
function getNoise( v ) {

	//  make it curl
	for ( let i = 0; i < noiseSwirlSteps; i ++ ) {

		v = vec3( v.xy.add( vec2( fbm3( v ), fbm3( vec3( v.xy, v.z.add( 1000.0 ) ) ) ).mul( noiseSwirlStepValue ) ), v.z );

	}

	//  normalize
	return fbm5( v ).div( 2.0 ).add( 0.5 );

}

// mainImage: returns how thick the smoke is here (0..2, it's a grey level in the original)
export function smoke( { time, rise, mouse, hover } ) {

	const st = uv(); // fragCoord.xy / iResolution.xy

	// added: the smoke drifts up, and is pushed away from the mouse (more the closer it is)
	const away = st.sub( mouse );
	const push = exp( dot( away, away ).mul( - 40.0 ) ).mul( hover ).mul( 0.25 );
	const at = st.sub( vec2( 0.0, time.mul( rise ) ) ).sub( normalize( away.add( 0.0001 ) ).mul( push ) );

	// float noise = getNoise(vec3(uv * noiseScale, iTime * noiseTimeScale));
	const noise = getNoise( vec3( at.mul( noiseScale ), time.mul( noiseTimeScale ) ) );

	// noise = noise * noise * noise * noise * 2.0;  //more contrast
	const contrast = noise.mul( noise ).mul( noise ).mul( noise ).mul( 2.0 );

	// added: it thins out right around the mouse
	const clear = float( 1.0 ).sub( exp( length( away ).mul( length( away ) ).mul( - 60.0 ) ).mul( hover ).mul( 0.8 ) );

	return contrast.mul( clear );

}
