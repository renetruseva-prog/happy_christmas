// cracking an egg: it's tapped twice on the rim, the shell splits into two halves that swing open
// from the bottom, and the clear white and the yolk fall onto a free spot in the bowl. The white
// spreads into a thin glossy puddle and the yolk sits on it.
import * as THREE from 'three/webgpu';
import { animate, until, arcLerp, ease } from '../sequence.js';
import { ctx, bowl, solids, claimSpot, Layer } from './contents.js';
import { materials } from './materials.js';
import { GRAVITY } from './particles.js';

const UP = new THREE.Vector3( 0, 1, 0 );
const YOLK_RADIUS = 0.0125;
const WHITE = { radius: 0.026, height: 0.007, lumps: 0.35 }; // the puddle it spreads into

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

function makeYolk() {

	const yolk = new THREE.Mesh( new THREE.SphereGeometry( YOLK_RADIUS, 24, 16 ), materials.yolk );
	yolk.castShadow = true;
	ctx.scene.add( yolk );
	solids.push( yolk );
	return yolk;

}

// let it fall (after `delay` seconds) until it's down at restY
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

export async function crackEgg( root ) {

	root.geometry.computeBoundingBox();
	const size = root.geometry.boundingBox.getSize( new THREE.Vector3() ).multiply( root.scale );
	const long = Math.max( size.x, size.y, size.z );
	const short = Math.min( size.x, size.y, size.z );

	// lie it sideways to the camera, so the crack faces the player
	const toCamera = new THREE.Vector3().subVectors( ctx.camera.position, bowl.center ).setY( 0 ).normalize();
	const along = new THREE.Vector3().crossVectors( UP, toCamera ).normalize();
	const shells = makeShells( long, short, root.material );
	shells.group.quaternion.setFromRotationMatrix( new THREE.Matrix4().makeBasis( along, UP, new THREE.Vector3().crossVectors( along, UP ) ) );
	shells.group.position.copy( root.getWorldPosition( new THREE.Vector3() ) );
	ctx.scene.add( shells.group );
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
	const spot = claimSpot( 0.025, 0.02 );
	const drop = new THREE.Vector3( spot.x, bowl.rimY + 0.06, spot.z );
	await animate( 0.3, ( k ) => arcLerp( egg, onRim, drop, ease( k ), 0.02 ) );

	// 4. open it: the white and the yolk fall out
	const whiteLayer = new Layer( { x: spot.x, z: spot.z, ...WHITE, material: materials.eggWhite } );
	const bottom = whiteLayer.bottom; // what's under the egg's middle

	const white = new THREE.Mesh( new THREE.SphereGeometry( 1, 24, 16 ), materials.eggWhiteDrop );
	white.scale.set( 0.022, 0.03, 0.022 );
	white.position.set( spot.x, drop.y - 0.01, spot.z );
	ctx.scene.add( white );
	const yolk = makeYolk();
	yolk.position.set( spot.x, drop.y - 0.005, spot.z );

	const opening = animate( 0.3, ( k ) => shells.open( 0.06 + 0.94 * ease( k ) ) );

	const whiteLands = fall( white, bottom + 0.008 ).then( async () => {

		ctx.scene.remove( white );
		await animate( 0.35, ( k ) => whiteLayer.setGrowth( ease( k ) ) ); // it spreads out

	} );

	const yolkLands = fall( yolk, bottom + whiteLayer.height + YOLK_RADIUS * 0.7, { delay: 0.05 } ).then( () =>
		animate( 0.15, ( k ) => yolk.scale.set( 1 + 0.12 * k, 1 - 0.3 * k, 1 + 0.12 * k ) ), // squashes a little
	);

	// 5. the empty shells go away
	await opening;
	const shellsGone = animate( 0.4, ( k, dt ) => {

		shells.group.scale.setScalar( 1 - ease( k ) );
		egg.y += 0.05 * dt;

	} ).then( () => ctx.scene.remove( shells.group ) );

	await Promise.all( [ whiteLands, yolkLands, shellsGone ] );

}

// cracked before a page refresh: just the puddle and the yolk
export function restoreEgg( root ) {

	root.visible = false;
	const spot = claimSpot( 0.025, 0.02 );
	const whiteLayer = new Layer( { x: spot.x, z: spot.z, ...WHITE, material: materials.eggWhite } );
	whiteLayer.setGrowth( 1 );
	const yolk = makeYolk();
	yolk.position.set( spot.x, whiteLayer.bottom + whiteLayer.height + YOLK_RADIUS * 0.7, spot.z );
	yolk.scale.set( 1.12, 0.7, 1.12 );

}
