import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiSuggestionList } from './AiSuggestionList';
import type { AiSuggestion } from '@/types/api';

/** Respuesta típica de `POST /ai/classify` para el campo tipo documental. */
const SUGGESTIONS: AiSuggestion[] = [
  {
    value: 'Contrato de Prestación de Servicios',
    confidence: 0.91,
    reason: 'El documento menciona objeto, plazo y valor del contrato.',
  },
  {
    value: 'Acta de Reunión',
    confidence: 0.34,
    reason: 'Aparece una lista de asistentes al final.',
  },
];

const KNOWN = ['Contrato de Prestación de Servicios', 'Acta de Reunión'];

describe('AiSuggestionList · sugerencias de clasificación', () => {
  it('no preselecciona ningún valor: el campo sigue sin confirmar', () => {
    const onAccept = vi.fn();

    render(
      <AiSuggestionList
        fieldLabel="Tipo documental (TRD)"
        suggestions={SUGGESTIONS}
        value=""
        onAccept={onAccept}
        threshold={0.6}
        knownValues={KNOWN}
      />,
    );

    // La IA propone, nadie ha confirmado todavía.
    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.getByText('Sin confirmar')).toBeInTheDocument();
    expect(screen.queryByText(/Confirmado por una persona/)).not.toBeInTheDocument();
    // Y se ve que la propuesta viene de la IA.
    expect(screen.getAllByText('Sugerido por IA')).toHaveLength(2);
  });

  it('acepta una candidata con un solo clic', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();

    render(
      <AiSuggestionList
        fieldLabel="Tipo documental (TRD)"
        suggestions={SUGGESTIONS}
        value=""
        onAccept={onAccept}
        threshold={0.6}
        knownValues={KNOWN}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: /Usar «Contrato de Prestación de Servicios» como Tipo documental \(TRD\)/,
      }),
    );

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith('Contrato de Prestación de Servicios');
  });

  it('muestra la confianza declarada y marca como incierta la que baja del umbral', () => {
    render(
      <AiSuggestionList
        fieldLabel="Serie"
        suggestions={SUGGESTIONS}
        value=""
        onAccept={() => undefined}
        threshold={0.6}
        knownValues={KNOWN}
      />,
    );

    expect(screen.getByText('Confianza 91 %')).toBeInTheDocument();
    expect(screen.getByText('Confianza 34 %')).toBeInTheDocument();
    // Solo la de 34 % queda por debajo del umbral de 0,6.
    expect(screen.getAllByText('Incierta')).toHaveLength(1);
  });

  it('sin umbral publicado no califica ninguna sugerencia', () => {
    render(
      <AiSuggestionList
        fieldLabel="Serie"
        suggestions={SUGGESTIONS}
        value=""
        onAccept={() => undefined}
        threshold={null}
        knownValues={KNOWN}
      />,
    );

    expect(screen.queryByText('Incierta')).not.toBeInTheDocument();
    expect(screen.getByText('Confianza 34 %')).toBeInTheDocument();
  });

  it('no deja aceptar una propuesta que no existe en el catálogo del servidor', () => {
    render(
      <AiSuggestionList
        fieldLabel="Tipo documental (TRD)"
        suggestions={[
          { value: 'Tipo Inventado', confidence: 0.8, reason: 'No está en la TRD del módulo.' },
        ]}
        value=""
        onAccept={() => undefined}
        threshold={0.6}
        knownValues={KNOWN}
      />,
    );

    expect(screen.getByText('No existe en el catálogo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Usar «Tipo Inventado»/ })).toBeDisabled();
  });

  it('marca el valor ya confirmado por una persona', () => {
    render(
      <AiSuggestionList
        fieldLabel="Tipo documental (TRD)"
        suggestions={SUGGESTIONS}
        value="Acta de Reunión"
        onAccept={() => undefined}
        threshold={0.6}
        knownValues={KNOWN}
      />,
    );

    expect(screen.getByText('Confirmado por una persona')).toBeInTheDocument();
    expect(screen.getByText(/Confirmado: Acta de Reunión/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Usar «Acta de Reunión»/ })).not.toBeInTheDocument();
  });
});
