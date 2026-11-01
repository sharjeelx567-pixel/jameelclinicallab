import type { ColumnDef } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '@/components/shared/data-table';
import { ErrorState } from '@/components/shared/states';
import { FlagBadge, StatusBadge } from '@/components/shared/status';
import { Field, Input } from '@/components/ui/form-controls';
import { ORDER_STATUS } from '@/constants';
import { ApiError } from '@/lib/api-client';

type Row = { name: string; code: string };
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'code', header: 'Code' },
];

describe('DataTable', () => {
  const data = Array.from({ length: 20 }, (_, i) => ({ name: `Test ${i + 1}`, code: `T${i + 1}` }));

  it('paginates, searches and shows an empty state', async () => {
    const user = userEvent.setup();
    render(<DataTable data={data} columns={columns} pageSize={5} empty={{ title: 'Nothing' }} />);
    expect(screen.getByText('Showing 1–5 of 20')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Next page'));
    expect(screen.getByText('Test 6')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Filter rows'), 'Test 13');
    expect(screen.getByText('Test 13')).toBeInTheDocument();
    expect(screen.queryByText('Test 1')).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText('Filter rows'));
    await user.type(screen.getByLabelText('Filter rows'), 'zzz');
    expect(screen.getByText('No rows match your search.')).toBeInTheDocument();
  });

  it('sorts by column header', async () => {
    const user = userEvent.setup();
    render(<DataTable data={[{ name: 'B', code: '2' }, { name: 'A', code: '1' }]} columns={columns} searchable={false} />);
    await user.click(screen.getByRole('button', { name: /name/i }));
    const cells = screen.getAllByRole('cell').filter((c) => ['A', 'B'].includes(c.textContent ?? ''));
    expect(cells.map((c) => c.textContent)).toEqual(['A', 'B']);
  });
});

describe('Field', () => {
  it('wires errors to the control for screen readers', () => {
    render(
      <Field label="Mobile" htmlFor="m" error="Enter a valid mobile number">
        <Input id="m" />
      </Field>,
    );
    const input = screen.getByLabelText('Mobile');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'm-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid mobile number');
  });
});

describe('ErrorState', () => {
  it('explains forbidden access without a retry button', () => {
    render(<ErrorState error={new ApiError(403, 'FORBIDDEN', 'nope')} onRetry={() => undefined} />);
    expect(screen.getByText('Access restricted')).toBeInTheDocument();
    expect(screen.queryByText('Try again')).not.toBeInTheDocument();
  });

  it('offers retry for other errors', () => {
    render(<ErrorState error={new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the laboratory server.')} onRetry={() => undefined} />);
    expect(screen.getByText('Cannot reach the laboratory server.')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });
});

describe('status badges', () => {
  it('render labels and critical flags', () => {
    render(<><StatusBadge map={ORDER_STATUS} value="verification_pending" /><FlagBadge flag="critical_high" /></>);
    expect(screen.getByText('Verification pending')).toBeInTheDocument();
    expect(screen.getByText('Critical high')).toBeInTheDocument();
  });
});
