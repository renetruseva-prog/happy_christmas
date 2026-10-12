// the player's hand and arm: the mouse, drawn in the room. A right hand, palm down and fingers
// pointing forward and a little to the left, hovering over whatever the mouse points at; it curls
// into a grip when something is picked up. The arm in its red knitted sleeve comes in from the
// bottom right of the screen, from where the player's shoulder would be (an arm pointing straight
// at the camera would just be a tube hiding the hand). All made in code.
// (The hand is built as a right hand with the palm up, thumb on the right, fingers along -z, then
// turned palm down.)
import * as THREE from 'three/webgpu';
import { float, vec3, normalize, positionView, normalView } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const SCALE = 1.5; // a bit bigger than life, so it reads from a distance
const HOVER = 0.07 * SCALE; // how high the palm floats over what it points at
const TILT = - 0.18; // the fingers point a little down
const YAW = 0.95; // and to the left, so the fingers show in outline
const SPREAD = 0.13; // how far the fingers fan out from each other (radians)

const PALM = { width: 0.084, wrist: 0.064, thick: 0.024, length: 0.088 };

// from the thumb side: where on the knuckle line it starts, how long each part is, and how thick
// it is at the knuckle and at the tip
const FINGERS = [
	{ x: 0.029, parts: [ 0.048, 0.029, 0.023 ], base: 0.0098, tip: 0.0072 }, // index
	{ x: 0.0098, parts: [ 0.053, 0.033, 0.024 ], base: 0.0102, tip: 0.0074 }, // middle
	{ x: - 0.0098, parts: [ 0.048, 0.03, 0.023 ], base: 0.0096, tip: 0.0070 }, // ring
	{ x: - 0.029, parts: [ 0.038, 0.024, 0.019 ], base: 0.0086, tip: 0.0064 }, // little finger
];
const CURL = [ 0.6, 1.0, 0.75 ]; // how far each knuckle bends (radians) at a full grip

const UP = new THREE.Vector3( 0, 1, 0 );
const Z = new THREE.Vector3( 0, 0, 1 );

// skin: soft, with a warm glow at the edges, as light shows through the thin skin there
function skinMaterial( color, roughness ) {

	const material = new THREE.MeshStandardNodeMaterial( { color, roughness } );
	const view = normalize( positionView.negate() );
	const edge = float( 1 ).sub( normalView.dot( view ).abs() ).pow( 2.5 );
	material.emissiveNode = vec3( 0.55, 0.16, 0.09 ).mul( edge ).mul( 0.35 );
	return material;

}

export class Hand {

	constructor() {

		this.skin = skinMaterial( 0xe9b894, 0.72 );
		this.nailMaterial = new THREE.MeshStandardNodeMaterial( { color: 0xf3cfc3, roughness: 0.3 } );

		this.root = new THREE.Group(); // where the hand is, turned to face the way the player looks
		this.root.name = 'Hand';
		this.root.scale.setScalar( SCALE );
		this.root.visible = false;
		this.hand = new THREE.Group(); // the palm up, turned over
		this.hand.rotation.set( TILT, 0, Math.PI );
		this.root.add( this.hand );

		this.buildPalm();
		this.fingers = FINGERS.map( ( f ) => this.buildFinger( f ) );
		this.fingers.forEach( ( finger, n ) => { finger.joints[ 0 ].rotation.y = ( n - 1.5 ) * SPREAD; } );
		this.buildThumb();
		this.buildArm();

		this.curl = 0;
		this.show = false;
		this.placed = false; // it's been put somewhere (so it can glide from there)
		this.setCurl( 0.12 );
		for ( const part of [ this.root, this.arm ] ) part.traverse( ( o ) => { if ( o.isMesh ) o.castShadow = true; } );

	}

	mesh( geometry, material = this.skin ) {

		return new THREE.Mesh( geometry, material );

	}

	// a palm that narrows towards the wrist, with a slightly domed back (the back is -y here) and
	// a fleshy pad at the base of the thumb
	buildPalm() {

		const geometry = new RoundedBoxGeometry( PALM.width, PALM.thick, PALM.length, 6, 0.011 );
		const p = geometry.attributes.position;
		for ( let i = 0; i < p.count; i ++ ) {

			const along = ( p.getZ( i ) + PALM.length / 2 ) / PALM.length; // 0 at the knuckles .. 1 at the wrist
			const narrow = THREE.MathUtils.lerp( 1, PALM.wrist / PALM.width, along );
			const x = p.getX( i ) * narrow;
			p.setX( i, x );
			if ( p.getY( i ) < 0 ) p.setY( i, p.getY( i ) - 0.004 * ( 1 - ( x / ( PALM.width / 2 ) ) ** 2 ) ); // the back of the hand
			else p.setY( i, p.getY( i ) * 0.9 ); // a flatter palm

		}

		this.hand.add( this.mesh( geometry ) );

		// the pad at the base of the thumb (seen from the side), and the knuckles on the back
		const pad = this.mesh( new THREE.SphereGeometry( 1, 16, 12 ) );
		pad.scale.set( 0.019, 0.011, 0.03 );
		pad.position.set( PALM.width * 0.3, 0.006, 0.014 );
		this.hand.add( pad );

		FINGERS.forEach( ( { x, base } ) => {

			const knuckle = this.mesh( new THREE.SphereGeometry( base * 1.08, 14, 10 ) );
			knuckle.position.set( x, - 0.001, - PALM.length / 2 + 0.002 );
			this.hand.add( knuckle );

		} );

	}

	// jointed segments along -z that taper to a rounded tip, each bendable at its knuckle, with a
	// nail on the back of the last one. start: where the first one sits on the palm
	buildSegments( parts, base, tip, start, nailScale ) {

		const joints = [];
		const total = parts.reduce( ( a, b ) => a + b, 0 );
		let holder = this.hand;
		let done = 0;

		parts.forEach( ( length, i ) => {

			const r0 = THREE.MathUtils.lerp( base, tip, done / total );
			const r1 = THREE.MathUtils.lerp( base, tip, ( done + length ) / total );
			const joint = new THREE.Group();
			if ( i === 0 ) joint.position.copy( start );
			else joint.position.z = - parts[ i - 1 ];
			holder.add( joint );
			joints.push( joint );

			joint.add( this.mesh( new THREE.CylinderGeometry( r1, r0, length, 14, 1 ).rotateX( Math.PI / 2 ).translate( 0, 0, - length / 2 ) ) );
			joint.add( this.mesh( new THREE.SphereGeometry( r0, 14, 10 ) ) ); // (the round of the knuckle)

			if ( i === parts.length - 1 ) {

				const end = this.mesh( new THREE.SphereGeometry( r1, 14, 10 ) );
				end.position.z = - length;
				joint.add( end );

				const nail = this.mesh( new THREE.SphereGeometry( 1, 12, 8 ), this.nailMaterial );
				nail.scale.set( r1 * nailScale, r1 * 0.2, length * 0.46 );
				nail.position.set( 0, - r1 * 0.82, - length * 0.62 );
				joint.add( nail );

			}

			holder = joint;
			done += length;

		} );

		return { joints };

	}

	buildFinger( { x, parts, base, tip } ) {

		return this.buildSegments( parts, base, tip, new THREE.Vector3( x, - 0.001, - PALM.length / 2 + 0.004 ), 0.78 );

	}

	// the thumb: from the side of the palm, pointing forward and out, in three parts
	buildThumb() {

		this.thumb = this.buildSegments( [ 0.03, 0.033, 0.026 ], 0.0125, 0.0085, new THREE.Vector3( PALM.width * 0.42, 0, 0.024 ), 0.8 );
		this.thumbBase = - 0.7; // out to the side

	}

	// the forearm in a red knitted sleeve with a white cuff, along +z from the wrist; its length
	// is set every frame to reach the player's shoulder
	buildArm() {

		const wool = new THREE.MeshStandardNodeMaterial( { color: 0xb3202a, roughness: 0.97, side: THREE.DoubleSide } );
		const cuff = new THREE.MeshStandardNodeMaterial( { color: 0xf4efe6, roughness: 0.97 } );
		this.arm = new THREE.Group();
		this.arm.name = 'Hand_Arm';
		this.arm.visible = false;

		// the wrist and forearm, sticking out of the sleeve
		const forearm = this.mesh( new THREE.CylinderGeometry( 0.037, 0.028, 1, 18, 1 ).rotateX( Math.PI / 2 ).translate( 0, 0, 0.5 ) );
		forearm.scale.set( SCALE, SCALE, 0.16 * SCALE );
		this.arm.add( forearm );

		// the sleeve: from just behind the wrist, getting wider towards the shoulder
		this.cuffAt = 0.1 * SCALE;
		this.sleeve = new THREE.Mesh( new THREE.CylinderGeometry( 0.075 * SCALE, 0.048 * SCALE, 1, 24, 1, true ).rotateX( Math.PI / 2 ).translate( 0, 0, 0.5 ), wool );
		this.arm.add( this.sleeve );

		// the white rolled cuff
		const band = new THREE.Mesh( new THREE.CylinderGeometry( 0.053 * SCALE, 0.05 * SCALE, 0.034 * SCALE, 24 ).rotateX( Math.PI / 2 ), cuff );
		band.position.z = this.cuffAt;
		this.arm.add( band );

	}

	// 0 open and relaxed .. 1 gripping
	setCurl( value ) {

		this.curl = value;
		this.fingers.forEach( ( finger, n ) => {

			finger.joints.forEach( ( joint, i ) => {

				// (the outer fingers bend a touch more, like a real hand closing)
				joint.rotation.x = value * CURL[ i ] * ( 1 + n * 0.07 );

			} );

		} );

		const [ a, b, c ] = this.thumb.joints;
		a.rotation.y = this.thumbBase + value * 0.55;
		a.rotation.x = 0.35 + value * 0.25;
		b.rotation.x = value * 0.5;
		c.rotation.x = value * 0.7;

	}

	// where the palm is (in the world)
	get palm() {

		return this.root.position;

	}

	// every frame. point: where it hovers (a world position, or null to hide it); look: the way the
	// player faces (a flat direction); grip: 0..1; camera: the player's view, for where the arm comes from
	update( dt, { point, look, grip, camera } ) {

		this.show = point !== null;
		this.root.visible = this.arm.visible = this.show;
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
		this.reachShoulder( camera );

	}

	// the arm runs from the wrist to the player's shoulder: below and to the right of the camera,
	// out of the picture
	reachShoulder( camera ) {

		this.root.updateMatrixWorld( true );
		const wrist = this.hand.localToWorld( new THREE.Vector3( 0, 0.002, PALM.length / 2 + 0.004 ) );

		camera.updateMatrixWorld();
		const shoulder = new THREE.Vector3( 0.3, - 0.55, 0.1 ).applyMatrix4( camera.matrixWorld );

		const length = wrist.distanceTo( shoulder );
		this.arm.position.copy( wrist );
		this.arm.quaternion.setFromUnitVectors( Z, shoulder.sub( wrist ).normalize() );

		// the sleeve starts at the cuff and goes on past the shoulder
		this.sleeve.position.z = this.cuffAt;
		this.sleeve.scale.z = Math.max( 0.05, length - this.cuffAt + 0.2 );

	}

}
