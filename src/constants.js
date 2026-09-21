export const STORE_NAME = 'shopifyCart';
export const OPERATION_DETAIL_KEY = 'alpineShopifyCartOperationId';

export const MUTATION_EVENTS = Object.freeze([
  'shopify:cart:lines-update',
  'shopify:cart:note-update',
  'shopify:cart:attributes-update',
  'shopify:cart:discount-update',
]);

export const ALL_EVENTS = Object.freeze([
  ...MUTATION_EVENTS,
  'shopify:cart:error',
  'shopify:cart:view',
]);
