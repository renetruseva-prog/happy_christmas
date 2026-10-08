// what happens when an ingredient goes in the bowl: flour and sugar are poured from
// their bag/jar, an egg cracks open, butter drops in. Everything lands on the bowl's
// contents, which build up layer by layer.
import * as THREE from 'three/webgpu';
import { color, float, mix, mx_noise_float, positionWorld, smoothstep, step, time, uniform, vec3 } from 'three/tsl';
import { cancelTween } from './tween.js';

const GRAVITY = 9.8;
const UP = new THREE.Vector3( 0, 1, 0 );

// where the sugar jar's lid is put down while pouring, relative to the jar's spot
const LID_REST_OFFSET = new THREE.Vector3( - 0.13, 0, 0.06 );

let scene = null;
let camera = null;
let kitchen = null;

// the inside of the bowl, treated as a half sphere hanging under its rim
const bowl = { center: new THREE.Vector3(), rimY: 0, radius: 0 };

// ---------- a tiny timeline, so each sequence reads top to bottom with await ----------
const runners = new Set();

// call fn(k, dt) every frame for `duration` seconds, k going 0 → 1
function animate( duration, fn ) {

	return new Promise( ( resolve ) => runners.add( { duration, fn, resolve, t: 0 } ) );

}

// call fn(dt) every frame until it returns true
function until( fn ) {

	return new Promise( ( resolve ) => runners.add( { duration: Infinity, fn: ( k, dt ) => fn( dt ), resolve, t: 0 } ) );

}

const ease = ( k ) => k * k * ( 3 - 2 * k );

function arcLerp( target, from, to, k, height ) {

	target.lerpVectors( from, to, k );
	target.y += Math.sin( Math.PI * k ) * height;

}

// ---------- the contents of the bowl ----------
const layers = [];
const taken = []; // where yolks and the butter lie, so the next one lands somewhere free
const solids = []; // the yolks and the butter: they disappear into the dough when it's mixed

// the spot in the bowl (within `reach` of the middle, or on that circle when `ring` is set)
// furthest from everything already lying there
function freeSpot( reach, { ring = false } = {} ) {

	let best = { x: bowl.center.x, z: bowl.center.z };
	let bestRoom = - Infinity;
	for ( let i = 0; i < 24; i ++ ) {

		const a = i / 24 * Math.PI * 2 + Math.random() * 0.2;
		const r = ring ? reach : i === 0 ? 0 : reach * ( 0.5 + 0.5 * ( i % 2 ) );
		const x = bowl.center.x + Math.cos( a ) * r;
		const z = bowl.center.z + Math.sin( a ) * r;
		const room = taken.reduce( ( m, t ) => Math.min( m, Math.hypot( x - t.x, z - t.z ) - t.size ), 1 );
		if ( room > bestRoom ) {

			bestRoom = room;
			best = { x, z };

		}

	}

	return best;

}

// height of whatever is in the bowl at (x, z): the bowl's inside, or the highest heap there
function surfaceY( x, z ) {

	const dx = x - bowl.center.x;
	const dz = z - bowl.center.z;
	let y = bowl.rimY - Math.sqrt( Math.max( bowl.radius * bowl.radius - dx * dx - dz * dz, 0 ) );
	for ( const layer of layers ) y = Math.max( y, layer.domeAt( x, z ) );
	return y;

}

// one heap in the bowl (flour, sugar, egg white). Like real powder it piles up from
// where it lands into a lumpy dome; where the dome is lower than what is already
// there (the bowl's wall, an earlier heap) it stays hidden underneath.
// It grows from nothing (growth 0) to full (1).
class Layer {

	constructor( { x, z, radius, height, material, lumps = 0.12, clumps = 0, bottom = null } ) {

		this.x = x;
		this.z = z;
		this.radius = radius; // how far the dome spreads on a flat surface
		this.height = height;
		this.lumps = lumps;
		this.clumps = clumps;
		this.seed = Math.random() * 100;
		this.growth = 0;
		this.bottom = bottom ?? surfaceY( x, z ); // what it lands on, under its peak
		this.steepness = height / ( radius * radius );

		// the mesh covers the whole bowl; only the part above the earlier surface shows
		const rings = 18;
		const segs = 56;
		const reach = bowl.radius + Math.hypot( x - bowl.center.x, z - bowl.center.z );
		const count = 1 + rings * segs;
		const position = new Float32Array( count * 3 );
		this.base = new Float32Array( count ); // the surface under each vertex before this heap

		let i = 0;
		const put = ( d ) => ( phi ) => {

			let px = x + Math.cos( phi ) * d;
			let pz = z + Math.sin( phi ) * d;

			// stay inside the bowl
			const dx = px - bowl.center.x;
			const dz = pz - bowl.center.z;
			const dist = Math.hypot( dx, dz );
			const max = bowl.radius * 0.985;
			if ( dist > max ) {

				px = bowl.center.x + dx / dist * max;
				pz = bowl.center.z + dz / dist * max;

			}

			position[ i * 3 ] = px;
			position[ i * 3 + 2 ] = pz;
			this.base[ i ] = surfaceY( px, pz );
			i ++;

		};

		put( 0 )( 0 );
		for ( let r = 1; r <= rings; r ++ ) {

			const d = reach * ( r / rings ) ** 1.4; // denser rings near the peak
			for ( let s = 0; s < segs; s ++ ) put( d )( s / segs * Math.PI * 2 );

		}

		const index = [];
		for ( let s = 0; s < segs; s ++ ) index.push( 0, 1 + ( s + 1 ) % segs, 1 + s );
		for ( let r = 2; r <= rings; r ++ ) {

			for ( let s = 0; s < segs; s ++ ) {

				const a = 1 + ( r - 2 ) * segs + s;
				const a2 = 1 + ( r - 2 ) * segs + ( s + 1 ) % segs;
				const b = a + segs;
				const b2 = a2 + segs;
				index.push( a, b2, b, a, a2, b2 );

			}

		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute( 'position', new THREE.BufferAttribute( position, 3 ) );
		geometry.setAttribute( 'color', new THREE.BufferAttribute( new Float32Array( count * 3 ).fill( 1 ), 3 ) );
		geometry.setIndex( index );

		this.mesh = new THREE.Mesh( geometry, material );
		this.mesh.receiveShadow = true;
		scene.add( this.mesh );

		layers.push( this );
		this.setGrowth( 0 );

	}

	// height of the dome at (x, z): a rounded peak that falls off with distance, with a lumpy outline
	domeAt( x, z ) {

		const dx = x - this.x;
		const dz = z - this.z;
		const d2 = dx * dx + dz * dz;
		const phi = Math.atan2( dz, dx );
		const u = Math.min( Math.sqrt( d2 ) / this.radius, 1 );
		const wobble = 1 + this.lumps * u * ( 0.6 * Math.sin( 3 * phi + this.seed ) + 0.4 * Math.sin( 7 * phi + this.seed * 2 ) );
		// small clumps on the surface, so the light picks out its shape
		const clumps = this.clumps * ( Math.sin( x * 310 + this.seed ) * Math.sin( z * 290 - this.seed ) + 0.5 * Math.sin( ( x + z ) * 520 + this.seed * 3 ) );
		return this.bottom + this.growth * ( this.height + clumps ) - this.steepness * d2 * wobble;

	}

	setGrowth( g ) {

		this.growth = g;
		this.mesh.visible = g > 0.001;
		const { position, color: shade } = this.mesh.geometry.attributes;
		for ( let i = 0; i < position.count; i ++ ) {

			// on top of the dome where it's higher, tucked just under the earlier surface where it isn't
			const dome = this.domeAt( position.getX( i ), position.getZ( i ) );
			const above = dome - this.base[ i ];
			position.setY( i, above > 0 ? dome + 0.0005 : this.base[ i ] - 0.004 );

			// a little darker where the heap meets what's under it, so its outline reads
			const s = 0.7 + 0.3 * THREE.MathUtils.clamp( above / 0.008, 0, 1 );
			shade.setXYZ( i, s, s, s );

		}

		position.needsUpdate = true;
		shade.needsUpdate = true;
		this.mesh.geometry.computeVertexNormals();

	}

}

// ---------- falling grains (flour powder, sugar crystals) ----------
const HIDDEN = new THREE.Matrix4().makeScale( 0, 0, 0 );

class Grains {

	constructor( count, geometry, material, { drag = 0, onLand } ) {

		this.count = count;
		this.drag = drag;
		this.onLand = onLand; // returns true if the grain stays where it landed
		this.mesh = new THREE.InstancedMesh( geometry, material, count );
		this.mesh.frustumCulled = false;
		for ( let i = 0; i < count; i ++ ) this.mesh.setMatrixAt( i, HIDDEN );
		scene.add( this.mesh );

		this.pos = new Float32Array( count * 3 );
		this.vel = new Float32Array( count * 3 );
		this.size = new Float32Array( count );
		this.state = new Uint8Array( count ); // 0 unused, 1 falling, 2 resting
		this.rot = Array.from( { length: count }, () => new THREE.Quaternion().setFromEuler( new THREE.Euler( Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3 ) ) );
		this.next = 0;
		this.matrix = new THREE.Matrix4();
		this.p = new THREE.Vector3();
		this.s = new THREE.Vector3();

	}

	emit( position, velocity, size ) {

		const i = this.next;
		this.next = ( i + 1 ) % this.count; // reuse the oldest grain when the pool is full
		this.pos.set( [ position.x, position.y, position.z ], i * 3 );
		this.vel.set( [ velocity.x, velocity.y, velocity.z ], i * 3 );
		this.size[ i ] = size;
		this.state[ i ] = 1;

	}

	clear() {

		this.state.fill( 0 );
		for ( let i = 0; i < this.count; i ++ ) this.mesh.setMatrixAt( i, HIDDEN );
		this.mesh.instanceMatrix.needsUpdate = true;

	}

	update( dt ) {

		const { pos, vel } = this;
		const damp = Math.exp( - this.drag * dt );

		for ( let i = 0; i < this.count; i ++ ) {

			if ( this.state[ i ] === 0 ) {

				this.mesh.setMatrixAt( i, HIDDEN );
				continue;

			}

			if ( this.state[ i ] === 1 ) {

				const j = i * 3;
				vel[ j + 1 ] -= GRAVITY * dt;
				vel[ j ] *= damp;
				vel[ j + 2 ] *= damp;
				pos[ j ] += vel[ j ] * dt;
				pos[ j + 1 ] += vel[ j + 1 ] * dt;
				pos[ j + 2 ] += vel[ j + 2 ] * dt;

				// below the rim, the bowl's wall keeps grains inside
				if ( pos[ j + 1 ] < bowl.rimY ) {

					const dx = pos[ j ] - bowl.center.x;
					const dz = pos[ j + 2 ] - bowl.center.z;
					const d = Math.hypot( dx, dz );
					const max = bowl.radius * 0.95;
					if ( d > max ) {

						pos[ j ] = bowl.center.x + dx / d * max;
						pos[ j + 2 ] = bowl.center.z + dz / d * max;

					}

				}

				const ground = surfaceY( pos[ j ], pos[ j + 2 ] );
				if ( pos[ j + 1 ] - this.size[ i ] * 0.5 <= ground ) {

					const stays = this.onLand( pos[ j ], ground, pos[ j + 2 ] );
					pos[ j + 1 ] = ground + this.size[ i ] * 0.3;
					this.state[ i ] = stays ? 2 : 0;

				}

			}

			if ( this.state[ i ] === 0 ) {

				this.mesh.setMatrixAt( i, HIDDEN );
				continue;

			}

			this.p.fromArray( pos, i * 3 );
			this.s.setScalar( this.size[ i ] );
			this.mesh.setMatrixAt( i, this.matrix.compose( this.p, this.rot[ i ], this.s ) );

		}

		this.mesh.instanceMatrix.needsUpdate = true;

	}

}

// ---------- flour dust puffs ----------
const puffs = [];

function softDotTexture() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 64;
	const g = canvas.getContext( '2d' );
	const gradient = g.createRadialGradient( 32, 32, 0, 32, 32, 32 );
	gradient.addColorStop( 0, 'rgba(255,255,255,1)' );
	gradient.addColorStop( 1, 'rgba(255,255,255,0)' );
	g.fillStyle = gradient;
	g.fillRect( 0, 0, 64, 64 );
	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;

}

function spawnPuff( x, y, z, { size = 0.02, grow = 0.06, rise = 0.04, alpha = 0.3 } = {} ) {

	const puff = puffs.find( ( p ) => ! p.sprite.visible );
	if ( ! puff ) return;
	puff.sprite.position.set( x + ( Math.random() - 0.5 ) * 0.02, y + 0.005, z + ( Math.random() - 0.5 ) * 0.02 );
	puff.sprite.visible = true;
	Object.assign( puff, { t: 0, life: 0.7 + Math.random() * 0.5, size, grow, rise, alpha } );

}

function updatePuffs( dt ) {

	for ( const puff of puffs ) {

		if ( ! puff.sprite.visible ) continue;
		puff.t += dt;
		const k = puff.t / puff.life;
		if ( k >= 1 ) {

			puff.sprite.visible = false;
			continue;

		}

		puff.sprite.scale.setScalar( puff.size + puff.grow * k );
		puff.sprite.position.y += puff.rise * dt;
		puff.sprite.material.opacity = puff.alpha * Math.sin( Math.PI * Math.min( 1, k * 1.5 ) ) * ( 1 - k );

	}

}

// ---------- materials ----------
let materials = null;
const swirl = uniform( 0 ); // turns the dough's pattern while it's being mixed
let flourGrains = null;
let sugarGrains = null;
let flourStream = null;

function makeMaterials() {

	// flour: matt, a cooler white than the cream bowl, with a soft powdery mottling
	const flour = new THREE.MeshStandardNodeMaterial( { roughness: 1, vertexColors: true } );
	flour.colorNode = mix( color( 0xc9c7c1 ), color( 0xf4f4f1 ), mx_noise_float( positionWorld.mul( 260 ) ).mul( 0.5 ).add( 0.5 ) );

	// the falling stream: a soft column that breaks up into streaks as it falls
	const stream = new THREE.MeshStandardNodeMaterial( { color: 0xf3f3f0, roughness: 1, transparent: true, depthWrite: false, side: THREE.DoubleSide } );
	const streaks = mx_noise_float( vec3( positionWorld.x.mul( 500 ), positionWorld.y.add( time.mul( 1.4 ) ).mul( 45 ), positionWorld.z.mul( 500 ) ) );
	stream.opacityNode = smoothstep( - 0.35, 0.45, streaks ).mul( 0.85 );

	// sugar: tiny bright and dull specks, some of them shiny, so the heap looks grainy
	const sugar = new THREE.MeshStandardNodeMaterial( { vertexColors: true } );
	const speck = mx_noise_float( positionWorld.mul( 900 ) );
	sugar.colorNode = mix( color( 0xcdc8bf ), color( 0xffffff ), step( - 0.1, speck ) );
	sugar.roughnessNode = mix( float( 0.6 ), float( 0.08 ), step( 0.3, speck ) );

	// dough: warm golden beige, mottled; the pattern shifts with `swirl` so it churns while mixing
	const dough = new THREE.MeshStandardNodeMaterial( { roughness: 0.75, vertexColors: true } );
	const churn = mx_noise_float( positionWorld.mul( 60 ).add( vec3( swirl.sin().mul( 0.6 ), 0, swirl.cos().mul( 0.6 ) ) ) );
	dough.colorNode = mix( color( 0xc8975a ), color( 0xebd2a2 ), churn.mul( 0.5 ).add( 0.5 ) ).mul( mx_noise_float( positionWorld.mul( 300 ) ).mul( 0.06 ).add( 0.97 ) );

	return {
		flour,
		dough,
		stream,
		sugar,
		flourGrain: new THREE.MeshStandardNodeMaterial( { color: 0xf3f3f0, roughness: 1 } ),
		sugarGrain: new THREE.MeshStandardNodeMaterial( { color: 0xffffff, roughness: 0.12 } ),
		eggWhite: new THREE.MeshPhysicalNodeMaterial( { color: 0xf2e6b8, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.75, vertexColors: true } ),
		eggWhiteDrop: new THREE.MeshPhysicalNodeMaterial( { color: 0xf2e6b8, roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.75 } ),
		yolk: new THREE.MeshPhysicalNodeMaterial( { color: 0xe86400, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 } ),
	};

}

// how each container pours
const POURS = {
	Flour: { tilt: 2.0, pourHeight: 0.07, duration: 1.8, rate: 1800, speed: 0.15, spread: 0.025, size: [ 0.0012, 0.0026 ], radius: 0.1, height: 0.055, lumps: 0.25, clumps: 0.0025, dust: true, grains: () => flourGrains, mound: () => materials.flour },
	Sugar: { tilt: 1.95, pourHeight: 0.06, duration: 1.6, rate: 700, speed: 0.3, spread: 0.04, size: [ 0.0018, 0.003 ], radius: 0.035, height: 0.02, lumps: 0.15, clumps: 0.0008, grains: () => sugarGrains, mound: () => materials.sugar },
};

// ---------- setup ----------
const containers = new Map(); // bag/jar → where its opening is, its lid and the sugar inside

function rootOf( name ) {

	let obj = kitchen.getObjectByName( name );
	while ( obj && obj.parent && obj.parent !== kitchen ) obj = obj.parent;
	return obj;

}

// bounding box of everything in `obj`, measured in `frame`'s own coordinates
function boxIn( frame, obj = frame ) {

	frame.updateMatrixWorld( true );
	const toFrame = frame.matrixWorld.clone().invert();
	const box = new THREE.Box3();
	obj.traverse( ( o ) => {

		if ( ! o.isMesh ) return;
		o.geometry.computeBoundingBox();
		box.union( o.geometry.boundingBox.clone().applyMatrix4( new THREE.Matrix4().multiplyMatrices( toFrame, o.matrixWorld ) ) );

	} );
	return box;

}

function setupContainer( name, { lid, contents } = {} ) {

	const root = rootOf( name );
	if ( ! root ) return;

	const box = boxIn( root );
	const info = {
		spout: new THREE.Vector3( ( box.min.x + box.max.x ) / 2, box.max.y, ( box.min.z + box.max.z ) / 2 ),
		mouth: Math.min( box.max.x - box.min.x, box.max.z - box.min.z ) / 2,
		tableY: new THREE.Box3().setFromObject( root ).min.y,
	};

	// the lid and the sugar inside are separate objects in Blender: make them travel with the jar
	const lidObj = lid && kitchen.getObjectByName( lid );
	if ( lidObj ) {

		if ( lidObj.parent !== root ) root.attach( lidObj );
		info.lid = lidObj;
		info.lidLocal = { position: lidObj.position.clone(), quaternion: lidObj.quaternion.clone() };
		info.lidHalfHeight = ( boxIn( lidObj ).max.y - boxIn( lidObj ).min.y ) / 2;

	}

	const contentsObj = contents && kitchen.getObjectByName( contents );
	if ( contentsObj ) {

		if ( contentsObj.parent !== root ) root.attach( contentsObj );
		const cb = boxIn( root, contentsObj );
		info.contents = contentsObj;
		info.contentsBase = { y: contentsObj.position.y, scaleY: contentsObj.scale.y, half: ( cb.max.y - cb.min.y ) / 2 };

	}

	containers.set( root, info );

}

export function initPouring( world, sceneRef, cameraRef ) {

	scene = sceneRef;
	camera = cameraRef;
	kitchen = world.room;
	kitchen.updateMatrixWorld( true );

	const box = new THREE.Box3().setFromObject( world.bowl );
	box.getCenter( bowl.center );
	bowl.rimY = box.max.y;
	bowl.center.y = bowl.rimY;
	bowl.radius = ( box.max.x - box.min.x ) / 2 * 0.94; // inside of the wall (the bowl's wall is 6% of its radius)

	// the bowl starts empty (the finished dough in it is kept for the mixing step)
	const dough = kitchen.getObjectByName( 'Mixing_Bowl_Dough' );
	if ( dough ) dough.visible = false;

	materials = makeMaterials();
	flourGrains = new Grains( 3000, new THREE.IcosahedronGeometry( 1, 0 ), materials.flourGrain, {
		drag: 2.5,
		onLand: ( x, y, z ) => {

			if ( Math.random() < 0.04 ) spawnPuff( x, y, z );
			return false; // flour disappears into the heap

		},
	} );
	sugarGrains = new Grains( 1600, new THREE.BoxGeometry( 1, 1, 1 ), materials.sugarGrain, { onLand: () => true } );

	const dot = softDotTexture();
	for ( let i = 0; i < 60; i ++ ) {

		const sprite = new THREE.Sprite( new THREE.SpriteNodeMaterial( { map: dot, transparent: true, depthWrite: false, opacity: 0 } ) );
		sprite.visible = false;
		scene.add( sprite );
		puffs.push( { sprite, t: 0, life: 1 } );

	}

	// open cylinder, 1 unit tall, hanging down from its top: stretched from the bag's opening to the heap
	const streamGeometry = new THREE.CylinderGeometry( 0.6, 1.3, 1, 20, 8, true );
	streamGeometry.translate( 0, - 0.5, 0 );
	flourStream = new THREE.Mesh( streamGeometry, materials.stream );
	flourStream.visible = false;
	scene.add( flourStream );

	setupContainer( 'Flour_Bag' );
	setupContainer( 'Sugar_Jar', { lid: 'Sugar_Jar_Lid', contents: 'Sugar_Jar_Contents' } );

	const butter = kitchen.getObjectByName( 'Butter_Block' );
	if ( butter ) {

		// the paper is attached to the butter in Blender: take it off, so it stays on the
		// table and only the butter itself is picked up and dropped in the bowl
		const wrapper = butter.getObjectByName( 'Butter_Wrapper' );
		if ( wrapper ) kitchen.attach( wrapper );

	}

}

// ---------- the four ingredients ----------
export function addToBowl( root ) {

	cancelTween( root );
	switch ( root.userData.ingredient ) {

		case 'Flour': return pourFrom( root, POURS.Flour );
		case 'Sugar': return pourFrom( root, POURS.Sugar );
		case 'Egg': return crackEgg( root );
		case 'Butter': return dropButter( root );
		default: root.visible = false; return Promise.resolve();

	}

}

// an ingredient that was already in the bowl before a page refresh: show the end result
// straight away (the heap, the egg's puddle and yolk, the butter lying in the bowl)
export function restoreInBowl( root ) {

	const kind = root.userData.ingredient;

	if ( kind === 'Flour' || kind === 'Sugar' ) {

		const pour = POURS[ kind ];
		new Layer( { x: bowl.center.x, z: bowl.center.z, radius: pour.radius, height: pour.height, lumps: pour.lumps, clumps: pour.clumps, material: pour.mound() } ).setGrowth( 1 );
		const info = containers.get( root );
		if ( info?.contents ) {

			// the jar is mostly empty
			const { y, scaleY, half } = info.contentsBase;
			info.contents.scale.y = scaleY * 0.25;
			info.contents.position.y = y - half * 0.75;

		}

	} else if ( kind === 'Egg' ) {

		root.visible = false;
		const spot = freeSpot( 0.025 );
		taken.push( { x: spot.x, z: spot.z, size: 0.02 } );
		const whiteLayer = new Layer( { x: spot.x, z: spot.z, radius: 0.026, height: 0.007, material: materials.eggWhite, lumps: 0.35 } );
		whiteLayer.setGrowth( 1 );
		const yolkRadius = 0.0125;
		const yolk = new THREE.Mesh( new THREE.SphereGeometry( yolkRadius, 24, 16 ), materials.yolk );
		yolk.castShadow = true;
		yolk.position.set( spot.x, whiteLayer.bottom + whiteLayer.height + yolkRadius * 0.7, spot.z );
		yolk.scale.set( 1.12, 0.7, 1.12 );
		scene.add( yolk );
		solids.push( yolk );

	} else if ( kind === 'Butter' ) {

		const rest = butterRest( root );
		root.position.copy( rest.position );
		root.quaternion.copy( rest.quaternion );
		solids.push( root );

	} else root.visible = false;

}

// flour bag / sugar jar: tip it over the bowl, pour, put it back
async function pourFrom( root, pour ) {

	const info = containers.get( root );
	const home = root.userData.home;
	const start = root.position.clone();
	const startQ = root.quaternion.clone();

	// tip it towards the bowl, from the side where it normally stands
	const toBowl = new THREE.Vector3().subVectors( bowl.center, home.position ).setY( 0 ).normalize();
	const axis = new THREE.Vector3().crossVectors( UP, toBowl ).normalize();
	const tipped = new THREE.Quaternion().setFromAxisAngle( axis, pour.tilt ).multiply( home.quaternion );

	// hold it so that, fully tipped, its opening is just above the middle of the bowl
	const spoutTarget = bowl.center.clone().addScaledVector( toBowl, - 0.02 );
	spoutTarget.y = bowl.rimY + pour.pourHeight;
	const pivot = spoutTarget.clone().sub( info.spout.clone().multiply( root.scale ).applyQuaternion( tipped ) );

	// 1. carry it over, upright
	await animate( 0.5, ( k ) => {

		arcLerp( root.position, start, pivot, ease( k ), 0.05 );
		root.quaternion.slerpQuaternions( startQ, home.quaternion, ease( k ) );

	} );

	if ( info.lid ) await liftLid( info, home );

	// 2. tip it
	await animate( 0.55, ( k ) => root.quaternion.slerpQuaternions( home.quaternion, tipped, ease( k ) ) );

	// 3. pour: grains stream out of the opening while the heap grows in the bowl
	const layer = new Layer( {
		x: bowl.center.x + ( Math.random() - 0.5 ) * 0.03,
		z: bowl.center.z + ( Math.random() - 0.5 ) * 0.03,
		radius: pour.radius,
		height: pour.height,
		lumps: pour.lumps,
		clumps: pour.clumps,
		material: pour.mound(),
	} );
	const grains = pour.grains();
	const lip = new THREE.Vector3();
	const out = new THREE.Vector3();
	const vel = new THREE.Vector3();
	let carry = 0;

	await animate( pour.duration, ( k, dt ) => {

		// a little shake so it doesn't pour perfectly evenly
		const shake = Math.sin( k * 40 ) * 0.04 * ( 1 - k );
		root.quaternion.setFromAxisAngle( axis, pour.tilt + shake ).multiply( home.quaternion );
		root.updateMatrixWorld();
		lip.copy( info.spout ).applyMatrix4( root.matrixWorld );
		out.copy( UP ).applyQuaternion( root.quaternion ); // the way the opening faces

		carry += pour.rate * dt * ( k < 0.85 ? 1 : ( 1 - k ) / 0.15 );
		while ( carry >= 1 ) {

			carry --;
			const r = Math.sqrt( Math.random() ) * info.mouth * 0.6;
			const a = Math.random() * Math.PI * 2;
			const p = lip.clone().add( new THREE.Vector3( Math.cos( a ) * r, 0, Math.sin( a ) * r ) );
			vel.copy( out ).multiplyScalar( pour.speed ).add( new THREE.Vector3( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).multiplyScalar( pour.spread ) );
			grains.emit( p, vel, THREE.MathUtils.lerp( pour.size[ 0 ], pour.size[ 1 ], Math.random() ) );

		}

		if ( pour.dust ) {

			// flour: a soft falling column from the opening down to the heap, which
			// reaches down at the start and thins out at the end...
			const ground = surfaceY( lip.x, lip.z );
			const t = k * pour.duration;
			const flow = k < 0.85 ? 1 : ( 1 - k ) / 0.15;
			const width = 0.01 * flow;
			flourStream.visible = width > 0.0005;
			flourStream.position.copy( lip );
			flourStream.scale.set( width, Math.min( lip.y - ground, 0.5 * GRAVITY * t * t + 0.01 ), width );

			// ...with a faint cloud of dust around it
			if ( Math.random() < 0.7 ) spawnPuff( lip.x, THREE.MathUtils.lerp( lip.y, ground, Math.random() ), lip.z, { size: 0.015, grow: 0.035, rise: 0.015, alpha: 0.35 } );

		}

		// the heap starts once the first grains arrive
		layer.setGrowth( ease( THREE.MathUtils.clamp( ( k * pour.duration - 0.2 ) / ( pour.duration - 0.2 ), 0, 1 ) ) );

		if ( info.contents ) {

			// the jar empties
			const { y, scaleY, half } = info.contentsBase;
			const s = 1 - 0.75 * k;
			info.contents.scale.y = scaleY * s;
			info.contents.position.y = y - half * ( 1 - s );

		}

	} );

	if ( flourStream ) flourStream.visible = false;

	// 4. tip it back and put it back where it was
	await animate( 0.45, ( k ) => root.quaternion.slerpQuaternions( tipped, home.quaternion, ease( k ) ) );
	const from = root.position.clone();
	await animate( 0.55, ( k ) => arcLerp( root.position, from, home.position, ease( k ), 0.05 ) );

	if ( info.lid ) await replaceLid( info, root );

}

async function liftLid( info, home ) {

	const lid = info.lid;
	kitchen.attach( lid ); // stays on the table while the jar pours
	const from = lid.position.clone();
	const to = home.position.clone().add( LID_REST_OFFSET );
	to.y = info.tableY + info.lidHalfHeight;
	await animate( 0.4, ( k ) => arcLerp( lid.position, from, to, ease( k ), 0.06 ) );

}

async function replaceLid( info, root ) {

	const lid = info.lid;
	root.updateMatrixWorld( true );
	const from = lid.position.clone();
	const to = root.localToWorld( info.lidLocal.position.clone() );
	await animate( 0.4, ( k ) => arcLerp( lid.position, from, to, ease( k ), 0.06 ) );
	root.attach( lid );
	lid.position.copy( info.lidLocal.position );
	lid.quaternion.copy( info.lidLocal.quaternion );

}

// two half shells that together look like the egg, opening from the bottom
function makeShells( long, short, material ) {

	const group = new THREE.Group();
	const shellMaterial = material.clone();
	shellMaterial.side = THREE.DoubleSide;
	const hinges = [];

	for ( const side of [ 1, - 1 ] ) {

		const geometry = new THREE.SphereGeometry( 1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2 ); // a cap pointing up
		geometry.rotateZ( - side * Math.PI / 2 ); // ...now pointing to +x or -x
		geometry.scale( long / 2, short / 2, short / 2 );

		const hinge = new THREE.Group(); // at the top of the crack, so the halves swing apart at the bottom
		hinge.position.y = short / 2;
		const mesh = new THREE.Mesh( geometry, shellMaterial );
		mesh.position.y = - short / 2;
		mesh.castShadow = true;
		hinge.add( mesh );
		group.add( hinge );
		hinges.push( { hinge, side } );

	}

	return {
		group,
		open( k ) {

			for ( const { hinge, side } of hinges ) {

				hinge.rotation.z = side * 1.1 * k;
				hinge.position.x = side * 0.01 * k;

			}

		},
	};

}

async function fall( obj, restY, { delay = 0 } = {} ) {

	let wait = delay;
	let vy = 0;
	await until( ( dt ) => {

		if ( ( wait -= dt ) > 0 ) return false;
		vy -= GRAVITY * dt;
		obj.position.y += vy * dt;
		if ( obj.position.y > restY ) return false;
		obj.position.y = restY;
		return true;

	} );

}

// egg: tap it on the rim, crack it open, the white and the yolk drop in
async function crackEgg( root ) {

	root.geometry.computeBoundingBox();
	const size = root.geometry.boundingBox.getSize( new THREE.Vector3() ).multiply( root.scale );
	const long = Math.max( size.x, size.y, size.z );
	const short = Math.min( size.x, size.y, size.z );

	// lie it sideways to the camera, so the crack faces the player
	const toCamera = new THREE.Vector3().subVectors( camera.position, bowl.center ).setY( 0 ).normalize();
	const along = new THREE.Vector3().crossVectors( UP, toCamera ).normalize();
	const shells = makeShells( long, short, root.material );
	shells.group.quaternion.setFromRotationMatrix( new THREE.Matrix4().makeBasis( along, UP, new THREE.Vector3().crossVectors( along, UP ) ) );
	shells.group.position.copy( root.getWorldPosition( new THREE.Vector3() ) );
	scene.add( shells.group );
	root.visible = false;

	const egg = shells.group.position;
	const onRim = bowl.center.clone().addScaledVector( toCamera, bowl.radius / 0.94 );
	onRim.y = bowl.rimY + short / 2;
	const aboveRim = onRim.clone().setY( onRim.y + 0.05 );

	// 1. over to the near edge of the bowl
	const from = egg.clone();
	await animate( 0.4, ( k ) => arcLerp( egg, from, aboveRim, ease( k ), 0.04 ) );

	// 2. tap, tap (the second tap cracks it)
	await animate( 0.14, ( k ) => egg.lerpVectors( aboveRim, onRim, k * k ) );
	await animate( 0.12, ( k ) => egg.lerpVectors( onRim, aboveRim, ease( k ) * 0.5 ) );
	const tapFrom = egg.clone();
	await animate( 0.1, ( k ) => egg.lerpVectors( tapFrom, onRim, k * k ) );
	shells.open( 0.06 );

	// 3. over a free spot in the bowl (away from other yolks and the butter)
	const spot = freeSpot( 0.025 );
	taken.push( { x: spot.x, z: spot.z, size: 0.02 } );
	const land = new THREE.Vector3( spot.x, 0, spot.z );
	const drop = new THREE.Vector3( spot.x, bowl.rimY + 0.06, spot.z );
	await animate( 0.3, ( k ) => arcLerp( egg, onRim, drop, ease( k ), 0.02 ) );

	// 4. open it: the white and the yolk fall out
	const whiteLayer = new Layer( { x: land.x, z: land.z, radius: 0.026, height: 0.007, material: materials.eggWhite, lumps: 0.35 } );
	const bottom = whiteLayer.bottom; // what's under the egg's middle

	const white = new THREE.Mesh( new THREE.SphereGeometry( 1, 24, 16 ), materials.eggWhiteDrop );
	white.scale.set( 0.022, 0.03, 0.022 );
	white.position.set( land.x, drop.y - 0.01, land.z );
	const yolkRadius = 0.0125;
	const yolk = new THREE.Mesh( new THREE.SphereGeometry( yolkRadius, 24, 16 ), materials.yolk );
	yolk.castShadow = true;
	yolk.position.set( land.x, drop.y - 0.005, land.z );
	scene.add( white, yolk );

	const opening = animate( 0.3, ( k ) => shells.open( 0.06 + 0.94 * ease( k ) ) );

	const whiteLands = fall( white, bottom + 0.008 ).then( async () => {

		scene.remove( white );
		await animate( 0.35, ( k ) => whiteLayer.setGrowth( ease( k ) ) ); // it spreads out

	} );

	solids.push( yolk );
	const yolkLands = fall( yolk, bottom + whiteLayer.height + yolkRadius * 0.7, { delay: 0.05 } ).then( () =>
		animate( 0.15, ( k ) => yolk.scale.set( 1 + 0.12 * k, 1 - 0.3 * k, 1 + 0.12 * k ) ), // squashes a little
	);

	// 5. the empty shells go away
	await opening;
	const shellsGone = animate( 0.4, ( k, dt ) => {

		shells.group.scale.setScalar( 1 - ease( k ) );
		egg.y += 0.05 * dt;

	} ).then( () => scene.remove( shells.group ) );

	await Promise.all( [ whiteLands, yolkLands, shellsGone ] );

}

// where the butter lies in the bowl: a free spot a little off the middle, its long side along the
// bowl's wall, and high enough that no part of its underside sinks into the curved bowl (or
// into what's already in it), so it rests across the bowl like a real block would
function butterRest( root ) {

	const spot = freeSpot( 0.03, { ring: true } );
	taken.push( { x: spot.x, z: spot.z, size: 0.045 } );
	const outward = Math.atan2( spot.z - bowl.center.z, spot.x - bowl.center.x );
	const quaternion = new THREE.Quaternion().setFromAxisAngle( UP, - outward - Math.PI / 2 ).multiply( root.userData.home.quaternion );

	// check a grid of points across the underside
	root.geometry.computeBoundingBox();
	const { min, max } = root.geometry.boundingBox;
	const p = new THREE.Vector3();
	let y = - Infinity;
	for ( let i = 0; i <= 4; i ++ ) {

		for ( let j = 0; j <= 4; j ++ ) {

			p.set( THREE.MathUtils.lerp( min.x, max.x, i / 4 ), min.y, THREE.MathUtils.lerp( min.z, max.z, j / 4 ) ).multiply( root.scale ).applyQuaternion( quaternion );
			y = Math.max( y, surfaceY( spot.x + p.x, spot.z + p.z ) - p.y );

		}

	}

	return { position: new THREE.Vector3( spot.x, y + 0.001, spot.z ), quaternion };

}

// butter: drop it in, tumbling, and let it settle
async function dropButter( root ) {

	const home = root.userData.home;
	const start = root.position.clone();
	const startQ = root.quaternion.clone();

	// where it will lie (somewhere free, so it doesn't land on a yolk)
	const rest = butterRest( root );
	const above = new THREE.Vector3( rest.position.x, bowl.rimY + 0.12, rest.position.z );


	await animate( 0.45, ( k ) => {

		arcLerp( root.position, start, above, ease( k ), 0.04 );
		root.quaternion.slerpQuaternions( startQ, home.quaternion, ease( k ) );

	} );

	// fall, tumbling
	const axis = new THREE.Vector3( Math.random() - 0.5, 0, Math.random() - 0.5 ).normalize();
	const upright = root.quaternion.clone();
	const restY = rest.position.y;
	let angle = 0;
	let vy = 0;
	await until( ( dt ) => {

		vy -= GRAVITY * dt;
		root.position.y += vy * dt;
		angle += 6 * dt;
		root.quaternion.setFromAxisAngle( axis, angle ).multiply( upright );
		return root.position.y <= restY + 0.01;

	} );

	// land flat with a little bounce, lying along the bowl's wall
	const flat = rest.quaternion;
	const landQ = root.quaternion.clone();
	await animate( 0.25, ( k ) => {

		root.quaternion.slerpQuaternions( landQ, flat, ease( k ) );
		root.position.y = restY + 0.012 * Math.sin( Math.PI * k );

	} );
	root.position.y = restY;
	solids.push( root );

}

// ---------- mixing: everything in the bowl turns into one smooth dough ----------
let dough = null;

// the inside of the bowl, for the mixer: middle of the opening, rim height, inside radius
export function bowlInfo() {

	return { center: bowl.center.clone(), rimY: bowl.rimY, radius: bowl.radius };

}

// the dough is taken out of the bowl: nothing is left in it
export function emptyBowl() {

	for ( const layer of layers ) layer.mesh.visible = false;
	for ( const s of solids ) s.visible = false;
	sugarGrains.clear();

}

// how high the bowl's contents reach at (x, z)
export function contentsTop( x, z ) {

	return surfaceY( x, z );

}

// p 0 → 1: the dough rises from the bottom of the bowl until it covers everything, while the
// yolks and the butter get mixed in. turn: how far the mixer has spun (churns the dough's pattern)
export function mixDough( p, turn = 0 ) {

	if ( ! dough ) {

		// high enough to cover the tallest thing in the bowl
		const floor = bowl.rimY - bowl.radius;
		let top = floor;
		for ( let i = 0; i < 300; i ++ ) {

			const a = Math.random() * Math.PI * 2;
			const r = Math.sqrt( Math.random() ) * bowl.radius * 0.8;
			top = Math.max( top, surfaceY( bowl.center.x + Math.cos( a ) * r, bowl.center.z + Math.sin( a ) * r ) );

		}

		for ( const s of solids ) {

			top = Math.max( top, new THREE.Box3().setFromObject( s ).max.y );
			s.userData.mixScale = s.scale.clone();

		}

		dough = new Layer( { x: bowl.center.x, z: bowl.center.z, radius: bowl.radius * 1.2, height: top - floor + 0.008, material: materials.dough, lumps: 0.15, clumps: 0.002, bottom: floor } );

	}

	const k = THREE.MathUtils.clamp( p, 0, 1 );
	dough.setGrowth( ease( k ) );
	swirl.value = turn;

	for ( const s of solids ) {

		const left = 1 - ease( THREE.MathUtils.clamp( ( k - 0.15 ) / 0.6, 0, 1 ) );
		s.scale.copy( s.userData.mixScale ).multiplyScalar( Math.max( left, 0.001 ) );
		s.visible = left > 0.01;

	}

	if ( k >= 1 ) {

		// only the dough is left
		for ( const layer of layers ) if ( layer !== dough ) layer.mesh.visible = false;
		sugarGrains.clear();

	}

}

export function updatePouring( dt ) {

	for ( const r of runners ) {

		r.t += dt;
		const k = Math.min( 1, r.t / r.duration );
		if ( r.fn( k, dt ) === true || k >= 1 ) {

			runners.delete( r );
			r.resolve();

		}

	}

	flourGrains?.update( dt );
	sugarGrains?.update( dt );
	updatePuffs( dt );

}
