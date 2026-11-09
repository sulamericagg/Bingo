import { NativePurchases, PURCHASE_TYPE, type Transaction } from '@capgo/native-purchases';
import { FLASH_BONUSES, PRODUCTS, type ProductDef } from '../config';
import { addBoosts, addCoins, addGems, extra, ownsSkin, ownsTrail, unlockSkin, unlockTrail } from '../core/economy';
import { bus } from '../core/events';
import { isAndroid } from '../core/platform';
import { dayNumber, persistNow, save } from '../core/storage';
import { notePurchase, onNoAdsPurchased } from './ads';

const prices = new Map<string, string>();
let supported = false;

export const billingSupported = (): boolean => supported;
export const priceOf = (p: ProductDef): string => prices.get(p.id) ?? p.fallbackPrice;

/** Bônus de hoje da Oferta relâmpago (gira por dia). */
export const flashBonus = (day = dayNumber()) => FLASH_BONUSES[((day % FLASH_BONUSES.length) + FLASH_BONUSES.length) % FLASH_BONUSES.length];

/** O que uma compra entrega (para a UI mostrar a celebração). */
export interface Granted {
  def: ProductDef;
  coins: number;
  gems: number;
  skins: string[];
  trails: string[];
  boosts: { shield?: number; magnet?: number; headstart?: number };
  noAds: boolean;
  coinDoubler: boolean;
}

/** true se o item permanente já foi entregue neste aparelho. */
export function ownsProduct(def: ProductDef): boolean {
  if (def.consumable) return false;
  switch (def.kind) {
    case 'starter':
      return save.starter;
    case 'noads':
      return save.noAds;
    case 'doubler':
      return !!extra.coinDoubler;
    case 'vip':
      return !!extra.vip;
    case 'cosmetic':
      return (!def.skin || ownsSkin(def.skin)) && (!def.trail || ownsTrail(def.trail));
    default:
      return false;
  }
}

function grant(def: ProductDef): void {
  let coins = def.coins;
  const boosts = { ...(def.boosts ?? {}) };
  if (def.kind === 'flash') {
    const b = flashBonus();
    coins += b.coins ?? 0;
    for (const k of ['shield', 'magnet', 'headstart'] as const) if (b.boosts?.[k]) boosts[k] = (boosts[k] ?? 0) + b.boosts[k]!;
    extra.flashDay = dayNumber();
  }
  if (def.gems) addGems(def.gems);
  if (coins) addCoins(coins);
  if (def.noAds && !save.noAds) {
    save.noAds = true;
    onNoAdsPurchased();
  }
  if (def.kind === 'starter') save.starter = true;
  if (def.kind === 'vip') extra.vip = true;
  if (def.coinDoubler) extra.coinDoubler = true;
  if (def.skin) unlockSkin(def.skin);
  if (def.trail) unlockTrail(def.trail);
  if (boosts.shield || boosts.magnet || boosts.headstart) addBoosts(boosts);
  notePurchase();
  persistNow();
  const g: Granted = {
    def,
    coins,
    gems: def.gems,
    skins: def.skin ? [def.skin] : [],
    trails: def.trail ? [def.trail] : [],
    boosts,
    noAds: !!def.noAds,
    coinDoubler: !!def.coinDoubler,
  };
  bus.emit('purchase', def, g);
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
      if (!ownsProduct(def)) grant(def);
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
