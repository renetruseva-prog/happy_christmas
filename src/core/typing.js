// whether a key press is going into a text box (the card's message): the game's own keys (M for sound, the Shift
// shortcuts...) must leave it alone
export function isTyping( e ) {

	const target = e.target;
	return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || !! target?.isContentEditable;

}
