import AlpineShopifyCart from './index.js';

const REGISTRATION_KEY = '__alpineJsShopifyCartRegistered';

function register() {
  if (!window.Alpine || window[REGISTRATION_KEY]) return;

  window[REGISTRATION_KEY] = true;
  window.Alpine.plugin(AlpineShopifyCart);
}

if (typeof window !== 'undefined') {
  window.AlpineShopifyCart = AlpineShopifyCart;

  if (window.Alpine) {
    register();
  } else {
    document.addEventListener('alpine:init', register, { once: true });
  }
}
