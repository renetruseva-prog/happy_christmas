// the player's hand: the mouse, drawn in the room. A plump cartoon hand (round palm, short fat
// fingers and a stubby thumb, no nails or knuckles: a realistic hand looks uncanny in this soft
// little kitchen), palm down and pointing forward and a little to the left, hovering over whatever
// the mouse points at; it curls into a grip when something is picked up. Just the hand: an arm
// would only hide it. All made in code.
// (The hand is built as a right hand with the palm up, thumb on the right, fingers along -z, then
// turned palm down.)
import * as THREE from 'three/webgpu';

const SCALE = 1.5; // a bit bigger than life, so it reads from a distance
const HOVER = 0.06 * SCALE; // how high the palm floats over what it points at
const TILT = - 0.18; // the fingers point a little down
const YAW = 0.95; // and to the left, so the fingers show in outline
const SPREAD = 0.1; // how far the fingers fan out from each other (radians)

const PALM = { width: 0.088, thick: 0.05, length: 0.08 };

// from the thumb side: where on the front of the palm it starts, how long each of its two parts
// is, and how fat it is
const FINGERS = [
	{ x: 0.032, parts: [ 0.03, 0.022 ], radius: 0.0105 }, // index
	{ x: 0.0107, parts: [ 0.034, 0.024 ], radius: 0.0108 }, // middle
	{ x: - 0.0107, parts: [ 0.03, 0.022 ], radius: 0.0105 }, // ring
	{ x: - 0.032, parts: [ 0.024, 0.018 ], radius: 0.0094 }, // little finger
];
const CURL = [ 0.95, 1.25 ]; // how far each knuckle bends (radians) at a full grip

const UP = new THREE.Vector3( 0, 1, 0 );

export class Hand {

	constructor() {

		// soft and matte, a warm peach
		this.skin = new THREE.MeshStandardNodeMaterial( { color: 0xf5c8aa, roughness: 0.88 } );

		this.root = new THREE.Group(); // where the hand is, turned to face the way the player looks
		this.root.name = 'Hand';
		this.root.scale.setScalar( SCALE );
		this.root.visible = false;
		this.hand = new THREE.Group(); // the palm up, turned over
		this.hand.rotation.set( TILT, 0, Math.PI );
		this.root.add( this.hand );

		// the palm: a plump rounded shape
		const palm = this.mesh( new THREE.SphereGeometry( 1, 28, 18 ) );
		palm.scale.set( PALM.width / 2, PALM.thick / 2, PALM.length / 2 );
		this.hand.add( palm );

		this.fingers = FINGERS.map( ( f ) => this.buildFinger( f ) );
		this.fingers.forEach( ( finger, n ) => { finger.joints[ 0 ].rotation.y = ( n - 1.5 ) * SPREAD; } );
		this.buildThumb();

		this.curl = 0;
		this.show = false;
		this.placed = false; // it's been put somewhere (so it can glide from there)
		this.setCurl( 0.15 );
		this.root.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = true; } );

	}

	mesh( geometry, material = this.skin ) {

		return new THREE.Mesh( geometry, material );

	}

	// plump jointed parts along -z, all the same fatness, each ending in a round ball (so they
	// bend smoothly, and the last one has a round fingertip). start: where the first one sits
	buildSegments( parts, radius, start ) {

		const joints = [];
		let holder = this.hand;

		parts.forEach( ( length, i ) => {

			const joint = new THREE.Group();
			if ( i === 0 ) joint.position.copy( start );
			else joint.position.z = - parts[ i - 1 ];
			holder.add( joint );
			joints.push( joint );

			joint.add( this.mesh( new THREE.CylinderGeometry( radius, radius, length, 16, 1 ).rotateX( Math.PI / 2 ).translate( 0, 0, - length / 2 ) ) );
			joint.add( this.mesh( new THREE.SphereGeometry( radius, 16, 12 ) ) ); // (the round of the knuckle)

			if ( i === parts.length - 1 ) {

				const tip = this.mesh( new THREE.SphereGeometry( radius, 16, 12 ) );
				tip.position.z = - length;
				joint.add( tip );

			}

			holder = joint;

		} );

		return { joints };

	}

	buildFinger( { x, parts, radius } ) {

		return this.buildSegments( parts, radius, new THREE.Vector3( x, 0, - PALM.length * 0.38 ) );

	}

	// the thumb: stubby, from the side of the palm, pointing forward and out
	buildThumb() {

		this.thumb = this.buildSegments( [ 0.024, 0.02 ], 0.0125, new THREE.Vector3( PALM.width * 0.38, 0, 0.01 ) );
		this.thumbBase = - 0.75; // out to the side

	}

	// 0 open and relaxed .. 1 gripping
	setCurl( value ) {

		this.curl = value;
		this.fingers.forEach( ( finger, n ) => {

			finger.joints.forEach( ( joint, i ) => {

				// (the outer fingers bend a touch more, like a real hand closing)
				joint.rotation.x = value * CURL[ i ] * ( 1 + n * 0.06 );

			} );

		} );

		const [ a, b ] = this.thumb.joints;
		a.rotation.y = this.thumbBase + value * 0.6;
		a.rotation.x = value * 0.3;
		b.rotation.x = value * 0.8;

	}

	// where the palm is (in the world)
	get palm() {

		return this.root.position;

	}

	// where something held in the hand sits: just in front of the curled fingers, so it shows
	// instead of hiding under the fist
	holdPoint( out ) {

		this.root.updateMatrixWorld( true );
		return this.hand.localToWorld( out.set( 0.0, 0.02, - 0.125 ) );

	}

	// every frame. point: where it hovers (a world position, or null to hide it); look: the way the
	// player faces (a flat direction); grip: 0..1
	update( dt, { point, look, grip } ) {

		this.show = point !== null;
		this.root.visible = this.show;
		if ( ! this.show ) {

			this.placed = false;
			return;

		}

		const target = point.clone();
		target.y += HOVER;
		if ( ! this.placed ) this.root.position.copy( target );
		else this.root.position.lerp( target, 1 - Math.exp( - dt * 22 ) );

		const facing = new THREE.Quaternion().setFromUnitVectors( new THREE.Vector3( 0, 0, - 1 ), look );
		facing.multiply( new THREE.Quaternion().setFromAxisAngle( UP, YAW ) );
		if ( ! this.placed ) this.root.quaternion.copy( facing );
		else this.root.quaternion.slerp( facing, 1 - Math.exp( - dt * 14 ) );
		this.placed = true;

		this.setCurl( THREE.MathUtils.lerp( this.curl, grip, 1 - Math.exp( - dt * 14 ) ) );

	}

}
