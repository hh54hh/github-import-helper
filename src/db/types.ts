// أنواع البيانات الأساسية لتطبيق مركز البدر
// مصممة بحيث تكون متوافقة لاحقاً مع Lovable Cloud (Postgres) عبر مفتاح id واحد و timestamps.

export type ID = string;

export interface BaseEntity {
  id: ID;
  createdAt: number; // epoch ms
  updatedAt: number;
  // علم المزامنة المستقبلية مع Cloud
  syncStatus?: "local" | "synced" | "pending";
  remoteId?: string | null;
}

export interface Category extends BaseEntity {
  name: string;
}

export interface Product extends BaseEntity {
  name: string;
  sku: string; // كود/باركود
  model?: string; // الموديل (مهم للإلكترونيات)
  brand?: string;
  categoryId?: ID;
  costPrice: number; // سعر الكلفة
  salePrice: number; // سعر البيع
  stock: number; // الكمية المتاحة
  minStock: number; // حد التنبيه
  unit?: string; // قطعة، علبة...
  notes?: string;
}

export type PaymentMethod = "cash" | "card" | "transfer" | "credit";

export interface InvoiceItem {
  productId: ID;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  discount: number; // خصم على البند
  total: number; // (unitPrice * quantity) - discount
}

export type InvoiceStatus = "completed" | "returned" | "partially_returned";

export interface Invoice extends BaseEntity {
  number: string; // رقم الفاتورة المعروض (مثل INV-000123)
  items: InvoiceItem[];
  subtotal: number;
  discount: number; // خصم عام على الفاتورة
  total: number;
  paid: number;
  change: number;
  paymentMethod: PaymentMethod;
  customerName?: string;
  customerPhone?: string;
  status: InvoiceStatus;
  notes?: string;
}

export interface ReturnItem {
  productId: ID;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ReturnRecord extends BaseEntity {
  number: string; // RET-000xxx
  invoiceId: ID;
  invoiceNumber: string;
  items: ReturnItem[];
  total: number;
  reason?: string;
}

export interface StockMovement extends BaseEntity {
  productId: ID;
  type: "sale" | "return" | "manual_in" | "manual_out" | "adjustment";
  quantity: number; // موجب = دخول، سالب = خروج
  refId?: ID; // مرجع (فاتورة/مرتجع)
  note?: string;
}

export interface AppSettings {
  id: "settings";
  shopName: string;
  currency: string;
  pin: string; // رقم سري بسيط
  invoiceCounter: number;
  returnCounter: number;
  taxRate: number; // نسبة مئوية، 0 افتراضياً
  footerNote?: string;
  updatedAt: number;
}
