// قاعدة البيانات المحلية باستخدام Dexie (IndexedDB)
// مُصممة لتعمل أوفلاين الآن ومستعدة للمزامنة مع Lovable Cloud لاحقاً.
import Dexie, { type Table } from "dexie";
import type {
  Product,
  Category,
  Invoice,
  ReturnRecord,
  StockMovement,
  AppSettings,
} from "./types";

class BadrDB extends Dexie {
  products!: Table<Product, string>;
  categories!: Table<Category, string>;
  invoices!: Table<Invoice, string>;
  returns!: Table<ReturnRecord, string>;
  movements!: Table<StockMovement, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super("badr_center_db");
    this.version(1).stores({
      products: "id, sku, name, categoryId, brand, model, stock, updatedAt, syncStatus",
      categories: "id, name, updatedAt, syncStatus",
      invoices: "id, number, createdAt, status, syncStatus",
      returns: "id, number, invoiceId, createdAt, syncStatus",
      movements: "id, productId, type, createdAt, refId, syncStatus",
      settings: "id",
    });
  }
}

export const db = new BadrDB();

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const now = () => Date.now();

export async function ensureSettings(): Promise<AppSettings> {
  const existing = await db.settings.get("settings");
  if (existing) return existing;
  const fresh: AppSettings = {
    id: "settings",
    shopName: "مركز البدر",
    currency: "د.ع",
    pin: "1234",
    invoiceCounter: 0,
    returnCounter: 0,
    taxRate: 0,
    footerNote: "شكراً لتعاملكم مع مركز البدر",
    updatedAt: now(),
  };
  await db.settings.put(fresh);
  return fresh;
}

export function formatInvoiceNumber(n: number) {
  return `INV-${String(n).padStart(6, "0")}`;
}
export function formatReturnNumber(n: number) {
  return `RET-${String(n).padStart(6, "0")}`;
}
