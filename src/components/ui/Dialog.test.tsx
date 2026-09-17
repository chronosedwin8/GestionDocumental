import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dialog } from './Dialog';

function Harness({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [open] = useState(true);
  return (
    <>
      <button type="button">Fuera del diálogo</button>
      <Dialog
        open={open}
        onClose={onClose}
        title="Registrar evento"
        footer={<button type="button">Guardar</button>}
      >
        <input aria-label="Título" />
        <button type="button">Adjuntar</button>
      </Dialog>
    </>
  );
}

describe('Dialog · accesibilidad', () => {
  it('expone role=dialog, aria-modal y el título enlazado', async () => {
    render(<Harness onClose={() => undefined} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Registrar evento');
  });

  it('lleva el foco al primer elemento enfocable al abrirse', async () => {
    render(<Harness onClose={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cerrar diálogo' })).toHaveFocus();
    });
  });

  it('atrapa el foco: Tab desde el último elemento vuelve al primero', async () => {
    const user = userEvent.setup();
    render(<Harness onClose={() => undefined} />);

    const closeButton = screen.getByRole('button', { name: 'Cerrar diálogo' });
    const saveButton = screen.getByRole('button', { name: 'Guardar' });
    await waitFor(() => expect(closeButton).toHaveFocus());

    saveButton.focus();
    await user.tab();
    expect(closeButton).toHaveFocus();
  });

  it('atrapa el foco hacia atrás: Shift+Tab desde el primero va al último', async () => {
    const user = userEvent.setup();
    render(<Harness onClose={() => undefined} />);

    const closeButton = screen.getByRole('button', { name: 'Cerrar diálogo' });
    await waitFor(() => expect(closeButton).toHaveFocus());

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveFocus();
  });

  it('nunca deja el foco en elementos de fuera del diálogo', async () => {
    const user = userEvent.setup();
    render(<Harness onClose={() => undefined} />);

    const outside = screen.getByRole('button', { name: 'Fuera del diálogo' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar diálogo' })).toHaveFocus());

    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(outside).not.toHaveFocus();
    }
  });

  it('cierra con Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar diálogo' })).toHaveFocus());
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
