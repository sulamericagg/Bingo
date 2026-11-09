import { NativePurchases, PURCHASE_TYPE, type Transaction } from '@capgo/native-purchases';
import { PRODUCTS, type ProductDef } from '../config';
import { addCoins, addGems, unlockSkin } from '../core/economy';
import { bus } from '../core/events';
import { isAndroid } from '../core/platform';
import { persist, save } from '../core/storage';
import { onNoAdsPurchased } from './ads';

const prices = new Map<string, string>();
let supported = false;

export const billingSupported = (): boolean => supported;
export const priceOf = (p: ProductDef): string => prices.get(p.id) ?? p.fallbackPrice;

function grant(def: ProductDef): void {
  if (def.gems) addGems(def.gems);
  if (def.coins) addCoins(def.coins);
  if (def.kind === 'noads' || def.kind === 'starter') {
    save.noAds = true;
    onNoAdsPurchased();
  }
  if (def.kind === 'starter') save.starter = true;
  if (def.skin) unlockSkin(def.skin);
  persist();
  bus.emit('purchase', def);
}

/** Restaura itens permanentes e entrega compras de gemas que ficaram pendentes. */
async function reconcile(list: Transaction[]): Promise<void> {
  for (const t of list) {
    const def = PRODUCTS.find((p) => p.id === t.productIdentifier);
    if (!def || t.purchaseState === '2') continue; // 2 = pendente
    if (def.consumable) {
      if (t.purchaseToken) {
        try {
          await NativePurchases.consumePurchase({ purchaseToken: t.purchaseToken });
          grant(def);
        } catch {
          /* tenta de novo na próxima abertura */
        }
      }
    } else {
      const already = def.kind === 'starter' ? save.starter : save.noAds;
      if (!already) grant(def);
      if (t.purchaseToken && t.isAcknowledged === false) {
        NativePurchases.acknowledgePurchase({ purchaseToken: t.purchaseToken }).catch(() => {});
      }
    }
  }
}

export async function initBilling(): Promise<void> {
  if (!isAndroid) return;
  try {
    const { isBillingSupported } = await NativePurchases.isBillingSupported();
    supported = isBillingSupported;
    if (!supported) return;
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: PRODUCTS.map((p) => p.id),
      productType: PURCHASE_TYPE.INAPP,
    });
    for (const p of products) prices.set(p.identifier, p.priceString);
    bus.emit('prices');
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    await reconcile(purchases);
  } catch (e) {
    console.warn('Billing indisponível', e);
  }
}

export type BuyResult = 'ok' | 'cancel' | 'pending' | 'unavailable' | 'error';

export async function buy(def: ProductDef): Promise<BuyResult> {
  if (!isAndroid || !supported) return 'unavailable';
  try {
    const t = await NativePurchases.purchaseProduct({
      productIdentifier: def.id,
      productType: PURCHASE_TYPE.INAPP,
      quantity: 1,
      isConsumable: def.consumable,
      autoAcknowledgePurchases: true,
    });
    if (t.purchaseState === '2') return 'pending';
    grant(def);
    return 'ok';
  } catch (e: any) {
    const msg = String(e?.message ?? e).toLowerCase();
    if (msg.includes('cancel')) return 'cancel';
    if (msg.includes('already') || msg.includes('owned')) {
      await restore();
      return 'ok';
    }
    return 'error';
  }
}

export async function restore(): Promise<boolean> {
  if (!isAndroid || !supported) return false;
  try {
    await NativePurchases.restorePurchases().catch(() => {});
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP });
    await reconcile(purchases);
    return true;
  } catch {
    return false;
  }
}
