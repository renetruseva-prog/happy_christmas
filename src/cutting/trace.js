// the line you draw on the dough with the mouse, as little dots pressed into it close enough to
// look like one line, and a ring where you started so you can see where to close the shape
import * as THREE from 'three/webgpu';

const MAX_DOTS = 2000;
const SPACING = 0.0012; // metres between dots
const LIFT = 0.0008; // just above the dough's top, so it isn't hidden in it

export class Trace {

	constructor( parent, surfaceY ) {

		this.y = surfaceY + LIFT;
		this.points = []; // what was drawn, { x, z }
		this.dots = 0;

		const dot = new THREE.CircleGeometry( 0.0011, 10 ).rotateX( - Math.PI / 2 );
		this.mesh = new THREE.InstancedMesh( dot, new THREE.MeshBasicNodeMaterial( { color: 0x6b3d18 } ), MAX_DOTS );
		this.mesh.count = 0;
		this.mesh.frustumCulled = false;

		const ring = new THREE.RingGeometry( 0.004, 0.0058, 32 ).rotateX( - Math.PI / 2 );
		this.ringMaterial = new THREE.MeshBasicNodeMaterial( { color: 0x6b3d18, transparent: true, opacity: 0.7 } );
		this.ring = new THREE.Mesh( ring, this.ringMaterial );
		this.ring.visible = false;

		parent.add( this.mesh, this.ring );

	}

	start( p ) {

		this.points = [ p ];
		this.dots = 0;
		this.placeDot( p );
		this.ring.position.set( p.x, this.y, p.z );
		this.ring.visible = true;
		this.ringMaterial.color.set( 0x6b3d18 );

	}

	// the mouse moved on to p: dots all the way from the last point
	add( p ) {

		const last = this.points[ this.points.length - 1 ];
		const length = Math.hypot( p.x - last.x, p.z - last.z );
		if ( length < SPACING ) return;

		const steps = Math.floor( length / SPACING );
		for ( let i = 1; i <= steps; i ++ ) this.placeDot( { x: last.x + ( p.x - last.x ) * i / steps, z: last.z + ( p.z - last.z ) * i / steps } );
		this.points.push( p );

	}

	placeDot( p ) {

		if ( this.dots >= MAX_DOTS ) return;
		this.mesh.setMatrixAt( this.dots ++, new THREE.Matrix4().makeTranslation( p.x, this.y, p.z ) );
		this.mesh.count = this.dots;
		this.mesh.instanceMatrix.needsUpdate = true;

	}

	// the start ring lights up when letting go would close the shape
	showClosing( closing ) {

		this.ringMaterial.color.set( closing ? 0xfff1d6 : 0x6b3d18 );

	}

	clear() {

		this.points = [];
		this.dots = this.mesh.count = 0;
		this.ring.visible = false;

	}

}
