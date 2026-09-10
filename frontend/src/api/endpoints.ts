import { apiClient, type ApiListResponse, type ApiResponse } from './client';
import type {
  Challan,
  ChallanDetail,
  ChallanSummary,
  Customer,
  CustomerDetail,
  CustomerSummary,
  FollowUp,
  LoginResponse,
  Product,
  ProductDetail,
  ProductSummary,
  StockMovement,
} from '@/types/api';

/** Drops empty strings, null and undefined so they never reach the query string. */
function clean<T extends object>(params: T) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

// ------------------------------- auth ---------------------------------------

export const authApi = {
  async login(email: string, password: string) {
    const { data } = await apiClient.post<ApiResponse<LoginResponse>>('/auth/login', {
      email,
      password,
    });
    return data.data;
  },

  async me() {
    const { data } = await apiClient.get<ApiResponse<LoginResponse['user']>>('/auth/me');
    return data.data;
  },
};

// ----------------------------- customers ------------------------------------

export interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  customerType?: string;
  followUpDue?: boolean;
  includeInactive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const customersApi = {
  async list(params: CustomerListParams) {
    const { data } = await apiClient.get<ApiListResponse<Customer>>('/customers', {
      params: clean({
        ...params,
        followUpDue: params.followUpDue ? 'true' : undefined,
        includeInactive: params.includeInactive ? 'true' : undefined,
      }),
    });
    return data;
  },

  async get(id: string) {
    const { data } = await apiClient.get<ApiResponse<CustomerDetail>>(`/customers/${id}`);
    return data.data;
  },

  async summary() {
    const { data } = await apiClient.get<ApiResponse<CustomerSummary>>('/customers/summary');
    return data.data;
  },

  async create(payload: Record<string, unknown>) {
    const { data } = await apiClient.post<ApiResponse<Customer>>('/customers', payload);
    return data.data;
  },

  async update(id: string, payload: Record<string, unknown>) {
    const { data } = await apiClient.patch<ApiResponse<Customer>>(`/customers/${id}`, payload);
    return data.data;
  },

  async deactivate(id: string) {
    const { data } = await apiClient.delete<ApiResponse<Customer>>(`/customers/${id}`);
    return data.data;
  },

  async addFollowUp(id: string, payload: { note: string; followUpDate?: string | null }) {
    const { data } = await apiClient.post<ApiResponse<FollowUp>>(
      `/customers/${id}/followups`,
      clean(payload),
    );
    return data.data;
  },
};

// ------------------------------ products ------------------------------------

export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  lowStock?: boolean;
  includeInactive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const productsApi = {
  async list(params: ProductListParams) {
    const { data } = await apiClient.get<ApiListResponse<Product>>('/products', {
      params: clean({
        ...params,
        lowStock: params.lowStock ? 'true' : undefined,
        includeInactive: params.includeInactive ? 'true' : undefined,
      }),
    });
    return data;
  },

  async get(id: string) {
    const { data } = await apiClient.get<ApiResponse<ProductDetail>>(`/products/${id}`);
    return data.data;
  },

  async summary() {
    const { data } = await apiClient.get<ApiResponse<ProductSummary>>('/products/summary');
    return data.data;
  },

  async lowStock() {
    const { data } = await apiClient.get<ApiResponse<Array<Product & { shortBy: number }>>>(
      '/products/low-stock',
    );
    return data.data;
  },

  async categories() {
    const { data } = await apiClient.get<ApiResponse<string[]>>('/products/categories');
    return data.data;
  },

  async create(payload: Record<string, unknown>) {
    const { data } = await apiClient.post<ApiResponse<Product>>('/products', payload);
    return data.data;
  },

  async update(id: string, payload: Record<string, unknown>) {
    const { data } = await apiClient.patch<ApiResponse<Product>>(`/products/${id}`, payload);
    return data.data;
  },

  async deactivate(id: string) {
    const { data } = await apiClient.delete<ApiResponse<Product>>(`/products/${id}`);
    return data.data;
  },

  async adjustStock(
    id: string,
    payload: { quantity: number; movementType: 'IN' | 'OUT'; reason: string },
  ) {
    const { data } = await apiClient.post<
      ApiResponse<{ product: Product; movement: StockMovement }>
    >(`/products/${id}/stock`, payload);
    return data;
  },
};

// --------------------------- stock movements --------------------------------

export interface StockMovementListParams {
  page?: number;
  limit?: number;
  productId?: string;
  movementType?: string;
  referenceType?: string;
  from?: string;
  to?: string;
  sortOrder?: 'asc' | 'desc';
}

export const stockApi = {
  async list(params: StockMovementListParams) {
    const { data } = await apiClient.get<ApiListResponse<StockMovement>>('/stock-movements', {
      params: clean(params),
    });
    return data;
  },
};

// ------------------------------ challans ------------------------------------

export interface ChallanListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  customerId?: string;
  from?: string;
  to?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const challansApi = {
  async list(params: ChallanListParams) {
    const { data } = await apiClient.get<ApiListResponse<Challan>>('/challans', {
      params: clean(params),
    });
    return data;
  },

  async get(id: string) {
    const { data } = await apiClient.get<ApiResponse<ChallanDetail>>(`/challans/${id}`);
    return data.data;
  },

  async summary() {
    const { data } = await apiClient.get<ApiResponse<ChallanSummary>>('/challans/summary');
    return data.data;
  },

  async create(payload: {
    customerId: string;
    items: Array<{ productId: string; quantity: number }>;
    notes?: string | null;
    confirm?: boolean;
  }) {
    const { data } = await apiClient.post<ApiResponse<ChallanDetail>>('/challans', payload);
    return data;
  },

  async confirm(id: string) {
    const { data } = await apiClient.post<ApiResponse<ChallanDetail>>(`/challans/${id}/confirm`);
    return data;
  },

  async cancel(id: string, reason: string) {
    const { data } = await apiClient.post<ApiResponse<ChallanDetail>>(`/challans/${id}/cancel`, {
      reason,
    });
    return data;
  },
};
