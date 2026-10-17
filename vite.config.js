import { defineConfig } from 'vite';

// relative paths, so the build works from any folder (GitHub Pages serves it from /<repo name>/)
export default defineConfig( { base: './' } );
