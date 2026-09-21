export interface AlpineInstance {
  store(name: string): unknown;
  store(name: string, value: unknown): void;
  magic(name: string, callback: () => unknown): void;
}

export type AlpinePlugin = (Alpine: AlpineInstance) => void;
export type CartIdentifier = string | number;
export type CartContext = 'product' | 'cart' | 'dialog' | 'standard-action';

export interface Price {
  amount: string;
  currencyCode: string;
}

export interface CartCost {
  totalAmount: Price;
}

export interface CartLine {
  id: string;
  quantity: number;
  cost: CartCost;
}

export interface CartDiscountCode {
  applicable: boolean;
  code: string;
}

export interface CartSummary {
  id: string;
  totalQuantity: number;
  cost: CartCost;
  lines: CartLine[] | { nodes: CartLine[] };
  discountCodes: CartDiscountCode[];
}

export interface CartAttributeInput {
  key: string;
  value: string;
}

export interface CartLineInput {
  id?: CartIdentifier;
  merchandiseId?: CartIdentifier;
  quantity: number;
  attributes?: CartAttributeInput[];
  sellingPlanId?: CartIdentifier;
}

export interface CartMutationUserError {
  code?: string;
  field?: string[];
  message: string;
}

export interface CartMutationWarning {
  code?: string;
  message: string;
  target?: string;
}

export interface CartResultDetail {
  [key: string]: unknown;
}

export interface UpdateCartPayload {
  cartId?: string;
  lines?: CartLineInput[];
  note?: string;
  discountCodes?: string[];
  attributes?: CartAttributeInput[];
}

export interface UpdateCartResult {
  cart: CartSummary | null;
  userErrors?: CartMutationUserError[];
  warnings?: CartMutationWarning[];
  detail?: CartResultDetail;
}

export interface GetCartResult {
  cart: CartSummary | null;
}

export interface StandardEventOptions {
  context?: CartContext;
  detail?: Record<string, unknown>;
}

export interface CartOperationOptions {
  signal?: AbortSignal;
  context?: CartContext;
  detail?: Record<string, unknown>;
  event?: StandardEventOptions;
}

export interface CartRefreshOptions {
  cartId?: string;
  signal?: AbortSignal;
}

export interface ShopifyCartErrorState {
  name: string;
  message: string;
  code?: string | number;
  detail?: Record<string, unknown>;
  operationId?: string;
  cause?: unknown;
}

export interface ShopifyCartStore {
  ready: boolean;
  cart: CartSummary | null;
  note?: string;
  attributes?: CartAttributeInput[];
  readonly lines: CartLine[];
  readonly totalQuantity: number;
  readonly cost: CartCost | null;
  readonly discountCodes: CartDiscountCode[];
  readonly pending: boolean;
  pendingCount: number;
  pendingOperation: string | null;
  error: ShopifyCartErrorState | null;
  userErrors: CartMutationUserError[];
  warnings: CartMutationWarning[];
  detail?: CartResultDetail;

  refresh(options?: CartRefreshOptions): Promise<GetCartResult>;
  mutate(payload: UpdateCartPayload, options?: CartOperationOptions): Promise<UpdateCartResult>;
  add(lines: CartLineInput | CartLineInput[], options?: CartOperationOptions): Promise<UpdateCartResult>;
  update(lines: CartLineInput | CartLineInput[], options?: CartOperationOptions): Promise<UpdateCartResult>;
  remove(lineIds: CartIdentifier | CartIdentifier[], options?: CartOperationOptions): Promise<UpdateCartResult>;
  setNote(note: string, options?: CartOperationOptions): Promise<UpdateCartResult>;
  setAttributes(attributes: CartAttributeInput[], options?: CartOperationOptions): Promise<UpdateCartResult>;
  setDiscountCodes(discountCodes: string[], options?: CartOperationOptions): Promise<UpdateCartResult>;
  open(): Promise<void>;
  dispose(): void;
}

export interface ShopifyActions {
  getCart(payload?: { cartId?: string }, options?: { signal?: AbortSignal }): Promise<GetCartResult>;
  updateCart(payload: UpdateCartPayload, options?: { signal?: AbortSignal; event?: StandardEventOptions }): Promise<UpdateCartResult>;
  openCart(): Promise<void>;
}

export interface PluginEnvironment {
  getWindow?: () => Window | { Shopify?: { actions?: Partial<ShopifyActions> } } | undefined;
  getDocument?: () => (EventTarget & { readyState?: DocumentReadyState }) | undefined;
}

export const STORE_NAME: 'shopifyCart';
export const MUTATION_EVENTS: readonly string[];
export const ALL_EVENTS: readonly string[];
export function createPlugin(environment?: PluginEnvironment): AlpinePlugin;

declare const AlpineShopifyCart: AlpinePlugin;
export default AlpineShopifyCart;
