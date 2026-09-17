import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DataTable } from './DataTable';
import type { Column } from '@/types/ui';

interface Row {
  id: string;
  title: string;
  total: number;
}

const ROWS: Row[] = [
  { id: '1', title: 'Acta de grado', total: 3 },
  { id: '2', title: 'Contrato docente', total: 7 },
];

const COLUMNS: Column<Row>[] = [
  { key: 'title', header: 'Documento', sortField: 'title', primary: true, required: true, render: (row) => row.title },
  { key: 'total', header: 'Folios', sortField: 'total', render: (row) => row.total },
];

function renderTable(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return render(
    <MemoryRouter>
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
        page={2}
        pageSize={10}
        total={45}
        sort="title"
        order="asc"
        onPageChange={() => undefined}
        onSortChange={() => undefined}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DataTable', () => {
  it('muestra el rango y el número de páginas de la paginación server-side', () => {
    renderTable();

    expect(screen.getByText('11–20 de 45')).toBeInTheDocument();
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
  });

  it('avanza y retrocede de página llamando a onPageChange', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    renderTable({ onPageChange });

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);

    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
  });

  it('deshabilita "anterior" en la primera página y "siguiente" en la última', () => {
    const { unmount } = renderTable({ page: 1 });
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeEnabled();
    unmount();

    renderTable({ page: 5 });
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();
  });

  it('cambia el tamaño de página', async () => {
    const user = userEvent.setup();
    const onPageSizeChange = vi.fn();
    renderTable({ onPageSizeChange });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Elementos por página' }), '50');
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('solicita el orden por la columna pulsada', async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    renderTable({ onSortChange });

    await user.click(screen.getByRole('button', { name: 'Ordenar por Folios' }));
    expect(onSortChange).toHaveBeenCalledWith('total');
  });

  it('muestra un estado vacío cuando no hay filas', () => {
    renderTable({ rows: [], total: 0, emptyTitle: 'Sin documentos' });
    expect(screen.getByText('Sin documentos')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('muestra un esqueleto mientras carga', () => {
    renderTable({ loading: true });
    expect(screen.getByRole('status', { name: 'Cargando datos' })).toBeInTheDocument();
  });
});
