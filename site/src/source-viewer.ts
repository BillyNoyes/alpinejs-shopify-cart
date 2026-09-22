import homeSource from '../index.html?raw';
import controllerSource from './demo.ts?raw';
import transportSource from './demo-runtime.ts?raw';

const setupSource = `import Alpine from 'alpinejs'
import { installDemo } from './demo'

installDemo(Alpine)
Alpine.start()`;

function cartMarkup() {
  const document = new DOMParser().parseFromString(homeSource, 'text/html');
  const cart = document.querySelector('[data-cart-demo]');
  if (!cart) throw new Error('Cart source markup was not found.');
  // The inspector is not part of the cart and would otherwise include a copy of itself.
  cart.querySelectorAll('[data-source-viewer]').forEach(element => element.remove());
  const lines = cart.outerHTML.split('\n');
  const pageIndent = lines.at(-1)?.match(/^[ \t]*/)?.[0] ?? '';
  return lines.map(line => line.startsWith(pageIndent) ? line.slice(pageIndent.length) : line).join('\n');
}

export function sourceViewer(root: HTMLElement) {
  let originalOverflow: string | undefined;
  const dialog = () => root.querySelector<HTMLDialogElement>('dialog');
  const restoreScroll = () => {
    if (originalOverflow === undefined) return;
    document.documentElement.style.overflow = originalOverflow;
    originalOverflow = undefined;
  };

  return {
    files: [] as { name: string; code: string }[],
    open() {
      const element = dialog();
      if (!element || element.open) return;
      if (!this.files.length) {
        this.files = [
          { name: 'Cart HTML', code: cartMarkup() },
          { name: 'demo.ts', code: controllerSource.trim() },
          { name: 'demo-runtime.ts', code: transportSource.trim() },
          { name: 'Setup', code: setupSource },
        ];
      }
      element.showModal();
      originalOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
    },
    close() { dialog()?.close(); },
    closed() { restoreScroll(); },
    destroy() {
      dialog()?.close();
      restoreScroll();
    },
  };
}
