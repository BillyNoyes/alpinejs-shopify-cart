import Alpine from 'alpinejs';
import { copyCode, docsNavigation } from './components';
import { installDemo } from './demo';
import { sourceViewer } from './source-viewer';

Alpine.data('copyCode', copyCode);
Alpine.data('docsNavigation', docsNavigation);
Alpine.data('sourceViewer', sourceViewer);
if (document.querySelector('[data-cart-demo]')) installDemo(Alpine);
Alpine.start();
