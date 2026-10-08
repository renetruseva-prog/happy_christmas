// smoke curling up from the top of the oven door when the cookies are starting to burn
import * as THREE from 'three/webgpu';

const COUNT = 50;
const puffs = [];
let from = null; // { min, max }: where along the top of the door it comes out

function softTexture() {

	const canvas = document.createElement( 'canvas' );
	canvas.width = canvas.height = 64;
	const g = canvas.getContext( '2d' );
	const gradient = g.createRadialGradient( 32, 32, 0, 32, 32, 32 );
	gradient.addColorStop( 0, 'rgba(255,255,255,1)' );
	gradient.addColorStop( 0.5, 'rgba(255,255,255,0.45)' );
	gradient.addColorStop( 1, 'rgba(255,255,255,0)' );
	g.fillStyle = gradient;
	g.fillRect( 0, 0, 64, 64 );
	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;

}

export function initSmoke( room ) {

	const door = room.getObjectByName( 'Oven_Door' );
	if ( ! door ) return;
	const box = new THREE.Box3().setFromObject( door );
	from = { min: new THREE.Vector3( box.min.x + 0.06, box.max.y, box.max.z ), max: new THREE.Vector3( box.max.x - 0.06, box.max.y, box.max.z ) };

	const texture = softTexture();
	for ( let i = 0; i < COUNT; i ++ ) {

		const sprite = new THREE.Sprite( new THREE.SpriteNodeMaterial( { map: texture, transparent: true, depthWrite: false, opacity: 0 } ) );
		sprite.visible = false;
		room.add( sprite );
		puffs.push( { sprite, t: 0, life: 1, drift: 0 } );

	}

}

// dark: 0 grey wisps .. 1 thick dark smoke
function puff( dark ) {

	const p = puffs.find( ( q ) => ! q.sprite.visible );
	if ( ! p ) return;
	p.sprite.position.lerpVectors( from.min, from.max, Math.random() );
	p.sprite.visible = true;
	p.sprite.material.color.setScalar( THREE.MathUtils.lerp( 0.75, 0.18, dark ) );
	Object.assign( p, { t: 0, life: 1.6 + Math.random(), drift: ( Math.random() - 0.5 ) * 0.06, alpha: THREE.MathUtils.lerp( 0.25, 0.6, dark ) } );

}

// amount: puffs per second (0 for none)
export function updateSmoke( dt, amount, dark ) {

	if ( ! from ) return;
	if ( Math.random() < amount * dt ) puff( dark );

	for ( const p of puffs ) {

		if ( ! p.sprite.visible ) continue;
		p.t += dt;
		const k = p.t / p.life;
		if ( k >= 1 ) {

			p.sprite.visible = false;
			continue;

		}

		p.sprite.scale.setScalar( 0.05 + 0.25 * k );
		p.sprite.position.y += ( 0.18 - 0.08 * k ) * dt;
		p.sprite.position.z += 0.04 * dt;
		p.sprite.position.x += p.drift * dt;
		p.sprite.material.opacity = p.alpha * Math.sin( Math.PI * Math.min( 1, k * 2 ) ) * ( 1 - k );

	}

}
