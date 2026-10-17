# Sound files

Drop files here named exactly like this (`.mp3`, `.ogg` or `.wav`). Any that are missing fall back
to a made-up sound, so you can add them one at a time. Keep effects short (under ~2 s) and music
a seamless loop. Check each file's licence before you ship it.

| file | when it plays |
| --- | --- |
| `music` | background loop (quiet, ~25% volume) |
| `pick` | picking up an ingredient |
| `drop` | an ingredient lands in the bowl |
| `mixer` | the mixer motor (looped; pitch follows its speed) |
| `egg_crack` | the egg cracks on the bowl's rim |
| `thud` | dough set down on the table |
| `ding` | mixed / rolled / taken out of the oven |
| `cut` | a cookie is cut |
| `tray` | a cookie goes on the baking tray |
| `door` | the oven door, tray going in or out |
| `success` | perfectly baked, and the decorating start |
| `fail` | underbaked or burnt |
| `squeeze`, `click` | spare, for the icing and buttons (not wired yet) |

Sound settings: the panel on the left (music and sounds each have on/off and a volume slider), or press M for everything off/on. Sounds and the call names are in `src/audio.js`; what
triggers them is in `src/sounds.js`.
