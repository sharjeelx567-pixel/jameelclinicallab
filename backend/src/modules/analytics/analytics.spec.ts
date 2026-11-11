import { ALL_PERMISSIONS } from '../../common/permissions';
import { C } from '../../database/data-store';
import { MemoryDataStore } from '../../database/memory-data-store';
import { labDateKey } from '../../utils';
import type { InventoryService } from '../inventory/inventory.module';
import { AnalyticsService } from './analytics.module';

const user = { uid: 'a', email: 'a@x', displayName: 'A', role: 'super_admin' as const, permissions: [...ALL_PERMISSIONS] };
const inventory = { alerts: async () => ({ lowStock: [], expiringSoon: [], expired: [] }) } as unknown as InventoryService;
const tz = process.env.LAB_TIMEZONE ?? 'Asia/Karachi';

describe('dashboard statistics (aggregations instead of reading whole collections)', () => {
  it('computes weekly registrations, unpaid balances and monthly revenue; saves closed months once', async () => {
    const store = new MemoryDataStore();
    const now = Date.now();
    for (let i = 0; i < 3; i++) await store.create(C.patients, `p${i}`, { id: `p${i}`, status: 'active', createdAt: new Date(now - i * 86400_000).toISOString() });
    await store.create(C.orders, 'o1', { id: 'o1', status: 'completed', createdAt: new Date(now).toISOString(), items: [], billing: { balance: 300, total: 500 } });
    await store.create(C.orders, 'o2', { id: 'o2', status: 'completed', createdAt: new Date(now).toISOString(), items: [], billing: { balance: 0, total: 200 } });
    await store.create(C.orders, 'o3', { id: 'o3', status: 'completed', createdAt: new Date(now).toISOString(), items: [], billing: { balance: 150.5, total: 150.5 } });
    const today = labDateKey(tz, new Date());
    const [y, m] = today.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
    await store.create(C.payments, 'pay1', { id: 'pay1', type: 'payment', amount: 1000, businessDate: today });
    await store.create(C.payments, 'pay2', { id: 'pay2', type: 'refund', amount: 100, businessDate: today });
    await store.create(C.payments, 'pay3', { id: 'pay3', type: 'payment', amount: 700, businessDate: `${prev}-15` });

    const a = new AnalyticsService(store, inventory);
    const d = (await a.dashboard(user)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(d.weeklyRegistrations).toHaveLength(7);
    expect(d.weeklyRegistrations.reduce((s: number, x: { count: number }) => s + x.count, 0)).toBe(3);
    expect(d.weeklyRegistrations[6].count).toBe(1);
    expect(d.revenue).toEqual({ today: 900, outstanding: 450.5, outstandingOrders: 2 });
    expect(d.monthlyRevenue.slice(-2)).toEqual([{ month: prev, revenue: 700 }, { month: today.slice(0, 7), revenue: 900 }]);
    expect(await store.get(C.monthlyStats, `revenue-${prev}`)).toMatchObject({ revenue: 700 });

    // A new server instance reads the saved closed month (1 document) instead of its payments.
    const spy = jest.spyOn(store, 'query');
    const b = new AnalyticsService(store, inventory);
    await b.monthlyRevenue(6);
    const paymentQueries = spy.mock.calls.filter(([c]) => c === C.payments);
    expect(paymentQueries).toHaveLength(1); // only the current month
  });
});
