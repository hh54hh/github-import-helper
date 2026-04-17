// طبقة الخدمات: كل العمليات على البيانات تمر من هنا
// هكذا نضمن أن الانتقال للسحابة لاحقاً يكون بتعديل هذا الملف فقط.
import { db, ensureSettings, formatInvoiceNumber, formatReturnNumber, now, uid } from "./database";
import type {
  Product,
  Category,
  Invoice,
  InvoiceItem,
  ReturnRecord,
  ReturnItem,
  PaymentMethod,
} from "./types";

/* ========== المنتجات ========== */
export async function listProducts() {
  return db.products.orderBy("updatedAt").reverse().toArray();
}

export async function getProduct(id: string) {
  return db.products.get(id);
}

export async function searchProducts(q: string) {
  const term = q.trim().toLowerCase();
  if (!term) return listProducts();
  const all = await db.products.toArray();
  return all.filter(
    (p) =>
      p.name.toLowerCase().includes(term) ||
      p.sku.toLowerCase().includes(term) ||
      (p.model?.toLowerCase().includes(term) ?? false) ||
      (p.brand?.toLowerCase().includes(term) ?? false),
  );
}

export async function createProduct(
  data: Omit<Product, "id" | "createdAt" | "updatedAt" | "syncStatus">,
) {
  const product: Product = {
    ...data,
    id: uid(),
    createdAt: now(),
    updatedAt: now(),
    syncStatus: "local",
  };
  await db.products.add(product);
  return product;
}

export async function updateProduct(id: string, patch: Partial<Product>) {
  await db.products.update(id, { ...patch, updatedAt: now(), syncStatus: "local" });
  return db.products.get(id);
}

export async function deleteProduct(id: string) {
  await db.products.delete(id);
}

export async function adjustStock(productId: string, delta: number, note?: string) {
  const p = await db.products.get(productId);
  if (!p) throw new Error("منتج غير موجود");
  const newStock = p.stock + delta;
  if (newStock < 0) throw new Error("لا توجد كمية كافية في المخزن");
  await db.products.update(productId, { stock: newStock, updatedAt: now() });
  await db.movements.add({
    id: uid(),
    productId,
    type: delta >= 0 ? "manual_in" : "manual_out",
    quantity: delta,
    note,
    createdAt: now(),
    updatedAt: now(),
    syncStatus: "local",
  });
}

/* ========== الفئات ========== */
export async function listCategories() {
  return db.categories.orderBy("name").toArray();
}
export async function createCategory(name: string): Promise<Category> {
  const c: Category = {
    id: uid(),
    name,
    createdAt: now(),
    updatedAt: now(),
    syncStatus: "local",
  };
  await db.categories.add(c);
  return c;
}
export async function deleteCategory(id: string) {
  await db.categories.delete(id);
}

/* ========== الفواتير ========== */
export interface CreateInvoiceInput {
  items: InvoiceItem[];
  discount: number;
  paid: number;
  paymentMethod: PaymentMethod;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  if (!input.items.length) throw new Error("لا توجد منتجات في الفاتورة");

  return db.transaction("rw", db.invoices, db.products, db.movements, db.settings, async () => {
    // تحقق من المخزون
    for (const item of input.items) {
      const p = await db.products.get(item.productId);
      if (!p) throw new Error(`منتج محذوف: ${item.name}`);
      if (p.stock < item.quantity)
        throw new Error(`الكمية غير كافية للمنتج: ${p.name} (المتاح ${p.stock})`);
    }

    const settings = await ensureSettings();
    const nextNumber = settings.invoiceCounter + 1;

    const subtotal = input.items.reduce((s, i) => s + i.total, 0);
    const total = Math.max(0, subtotal - input.discount);
    const change = Math.max(0, input.paid - total);

    const invoice: Invoice = {
      id: uid(),
      number: formatInvoiceNumber(nextNumber),
      items: input.items,
      subtotal,
      discount: input.discount,
      total,
      paid: input.paid,
      change,
      paymentMethod: input.paymentMethod,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      notes: input.notes,
      status: "completed",
      createdAt: now(),
      updatedAt: now(),
      syncStatus: "local",
    };

    await db.invoices.add(invoice);
    await db.settings.update("settings", { invoiceCounter: nextNumber, updatedAt: now() });

    // خصم المخزون + حركات
    for (const item of input.items) {
      const p = await db.products.get(item.productId);
      if (!p) continue;
      await db.products.update(item.productId, {
        stock: p.stock - item.quantity,
        updatedAt: now(),
      });
      await db.movements.add({
        id: uid(),
        productId: item.productId,
        type: "sale",
        quantity: -item.quantity,
        refId: invoice.id,
        createdAt: now(),
        updatedAt: now(),
        syncStatus: "local",
      });
    }

    return invoice;
  });
}

export async function listInvoices() {
  return db.invoices.orderBy("createdAt").reverse().toArray();
}
export async function getInvoice(id: string) {
  return db.invoices.get(id);
}

/* ========== المرتجعات ========== */
export interface CreateReturnInput {
  invoiceId: string;
  items: ReturnItem[]; // الكميات المراد ارجاعها
  reason?: string;
}

export async function createReturn(input: CreateReturnInput): Promise<ReturnRecord> {
  return db.transaction(
    "rw",
    db.invoices,
    db.products,
    db.movements,
    db.returns,
    db.settings,
    async () => {
      const inv = await db.invoices.get(input.invoiceId);
      if (!inv) throw new Error("فاتورة غير موجودة");

      // تحقق أن كميات الإرجاع <= الكميات الأصلية
      for (const r of input.items) {
        const original = inv.items.find((i) => i.productId === r.productId);
        if (!original) throw new Error("منتج ليس ضمن الفاتورة");
        if (r.quantity <= 0) throw new Error("كمية إرجاع غير صحيحة");
        if (r.quantity > original.quantity)
          throw new Error(`أقصى كمية للارجاع للمنتج ${original.name} هي ${original.quantity}`);
      }

      const settings = await ensureSettings();
      const nextRet = settings.returnCounter + 1;
      const total = input.items.reduce((s, i) => s + i.total, 0);

      const rec: ReturnRecord = {
        id: uid(),
        number: formatReturnNumber(nextRet),
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        items: input.items,
        total,
        reason: input.reason,
        createdAt: now(),
        updatedAt: now(),
        syncStatus: "local",
      };
      await db.returns.add(rec);
      await db.settings.update("settings", { returnCounter: nextRet, updatedAt: now() });

      // إعادة الكمية للمخزن + تحديث حالة الفاتورة
      for (const r of input.items) {
        const p = await db.products.get(r.productId);
        if (p) {
          await db.products.update(r.productId, {
            stock: p.stock + r.quantity,
            updatedAt: now(),
          });
        }
        await db.movements.add({
          id: uid(),
          productId: r.productId,
          type: "return",
          quantity: r.quantity,
          refId: rec.id,
          createdAt: now(),
          updatedAt: now(),
          syncStatus: "local",
        });
      }

      // هل أصبحت الفاتورة مرتجعة كلياً؟
      const allReturns = await db.returns.where("invoiceId").equals(inv.id).toArray();
      const returnedQtyByProduct = new Map<string, number>();
      for (const ret of allReturns) {
        for (const it of ret.items) {
          returnedQtyByProduct.set(
            it.productId,
            (returnedQtyByProduct.get(it.productId) ?? 0) + it.quantity,
          );
        }
      }
      const fullyReturned = inv.items.every(
        (i) => (returnedQtyByProduct.get(i.productId) ?? 0) >= i.quantity,
      );
      const newStatus = fullyReturned ? "returned" : "partially_returned";
      await db.invoices.update(inv.id, { status: newStatus, updatedAt: now() });

      return rec;
    },
  );
}

export async function listReturns() {
  return db.returns.orderBy("createdAt").reverse().toArray();
}

export async function returnsForInvoice(invoiceId: string) {
  return db.returns.where("invoiceId").equals(invoiceId).toArray();
}

/* ========== لوحة المعلومات ========== */
export async function dashboardStats() {
  const [products, invoices, returns] = await Promise.all([
    db.products.toArray(),
    db.invoices.toArray(),
    db.returns.toArray(),
  ]);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const todayInvoices = invoices.filter((i) => i.createdAt >= todayMs);
  const todaySales = todayInvoices.reduce((s, i) => s + i.total, 0);
  const todayReturns = returns
    .filter((r) => r.createdAt >= todayMs)
    .reduce((s, r) => s + r.total, 0);
  const lowStock = products.filter((p) => p.stock <= p.minStock).length;
  const totalProducts = products.length;
  const stockValue = products.reduce((s, p) => s + p.stock * p.costPrice, 0);
  return {
    todaySales,
    todayInvoiceCount: todayInvoices.length,
    todayReturns,
    lowStock,
    totalProducts,
    stockValue,
    totalInvoices: invoices.length,
  };
}
