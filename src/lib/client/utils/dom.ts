export function scrollIntoView(node: HTMLElement, isLastItem: boolean) {
	if (isLastItem) {
		// Scroll the parent container, not the whole page
		const container = node.closest('.overflow-y-auto');
		if (container) {
			container.scrollTo({
				top: container.scrollHeight,
				behavior: 'smooth'
			});
		}
	}
}
