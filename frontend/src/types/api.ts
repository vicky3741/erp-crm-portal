export type Role = 'ADMIN' | 'SALES' | 'WAREHOUSE' | 'ACCOUNTS';
export type CustomerType = 'RETAIL' | 'WHOLESALE' | 'DISTRIBUTOR';
export type CustomerStatus = 'LEAD' | 'ACTIVE' | 'INACTIVE';
export type MovementType = 'IN' | 'OUT';
export type ChallanStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface Actor {
  id: string;
  name: string;
  role: Role;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string;
  email: string;
  businessName: string;
  gstNumber: string | null;
  customerType: CustomerType;
  address: string;
  status: CustomerStatus;
  followUpDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  notes?: string | null;
  _count?: { followUps: number; challans: number };
}

export interface FollowUp {
  id: string;
  note: string;
  followUpDate: string | null;
  createdAt: string;
  createdBy: Actor;
}

export interface CustomerChallanSummary {
  id: string;
  challanNumber: string;
  status: ChallanStatus;
  totalQuantity: number;
  totalAmount: string;
  createdAt: string;
}

export interface CustomerDetail extends Customer {
  createdBy: Actor;
  followUps: FollowUp[];
  challans: CustomerChallanSummary[];
}

export interface CustomerSummary {
  total: number;
  leads: number;
  active: number;
  inactive: number;
  followUpsDue: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  unitPrice: string;
  currentStock: number;
  minStockAlert: number;
  location: string;
  isActive: boolean;
  isLowStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  quantityChanged: number;
  movementType: MovementType;
  reason: string;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  createdBy: Actor;
  product?: { id: string; name: string; sku: string; category?: string };
}

export interface ProductDetail extends Product {
  stockMovements: StockMovement[];
  _count: { stockMovements: number; challanItems: number };
}

export interface ProductSummary {
  total: number;
  inactive: number;
  lowStock: number;
  outOfStock: number;
  totalUnitsInStock: number;
}

export interface ChallanItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productCategory: string;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface Challan {
  id: string;
  challanNumber: string;
  status: ChallanStatus;
  customerId: string;
  customerName: string;
  customerMobile: string;
  customerBusinessName: string;
  totalQuantity: number;
  totalAmount: string;
  notes: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
  confirmedBy: Actor | null;
  cancelledBy: Actor | null;
  _count?: { items: number };
}

export interface ChallanDetail extends Challan {
  items: ChallanItem[];
  customer: { id: string; name: string; mobile: string; businessName: string; isActive: boolean };
  stockMovements: Array<{
    id: string;
    quantityChanged: number;
    movementType: MovementType;
    reason: string;
    balanceAfter: number;
    createdAt: string;
    product: { id: string; name: string; sku: string };
  }>;
}

export interface ChallanSummary {
  total: number;
  drafts: number;
  confirmed: number;
  cancelled: number;
  createdToday: number;
  confirmedValue: string;
}

/** Shape the API returns when a stock guard rejects a request. */
export interface InsufficientStockDetail {
  productId: string;
  productName: string;
  sku: string;
  requested: number;
  available: number;
  shortBy: number;
}
