import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('se anuncia como diálogo modal accesible', () => {
    render(
      <ConfirmDialog
        open
        title="Eliminar documento"
        message="Esta acción no se puede deshacer."
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Eliminar documento')).toBeInTheDocument();
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument();
  });

  it('llama a onConfirm al pulsar el botón de confirmación', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open
        title="Aprobar"
        confirmLabel="Aprobar documento"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Aprobar documento' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('llama a onCancel al pulsar Cancelar', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<ConfirmDialog open title="Borrar" onConfirm={() => undefined} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cierra con la tecla Escape', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(<ConfirmDialog open title="Borrar" onConfirm={() => undefined} onCancel={onCancel} />);
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('bloquea la interacción mientras la acción está en curso', () => {
    render(
      <ConfirmDialog
        open
        loading
        title="Eliminando"
        confirmLabel="Eliminar"
        tone="danger"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
    // Sin botón de cierre cuando no es descartable.
    expect(screen.queryByRole('button', { name: 'Cerrar diálogo' })).not.toBeInTheDocument();
  });

  it('no renderiza nada cuando open es false', () => {
    render(
      <ConfirmDialog open={false} title="Oculto" onConfirm={() => undefined} onCancel={() => undefined} />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
