import Alpine from 'alpinejs';
import { copyCode, docsNavigation } from './components';
import { installDemo } from './demo';

Alpine.data('copyCode', copyCode);
Alpine.data('docsNavigation', docsNavigation);
if (document.querySelector('[data-cart-demo]')) installDemo(Alpine);
Alpine.start();
