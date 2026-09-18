import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IfFeature } from '@/components/ui/IfFeature';
import { useFeature, useFeatures } from './useFeature';

/**
 * El hook lee `effective_features` a través de `AuthContext`. Aquí se simula el
 * contexto para comprobar las tres situaciones reales: con la característica,
 * sin ella y con un servidor que todavía no publica el campo.
 */
const hasFeatureMock = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasFeature: hasFeatureMock }),
}));

/** Reproduce la lógica real de `AuthContext.hasFeature`. */
function withFeatures(features: string[] | null): void {
  hasFeatureMock.mockImplementation((code: string) =>
    features === null ? true : features.includes(code),
  );
}

function Probe({ code }: { code: string }): React.JSX.Element {
  const allowed = useFeature(code);
  return <span data-testid="probe">{allowed ? 'si' : 'no'}</span>;
}

function MultiProbe({ codes, mode }: { codes: string[]; mode: 'every' | 'some' }): React.JSX.Element {
  const allowed = useFeatures(codes, mode);
  return <span data-testid="multi">{allowed ? 'si' : 'no'}</span>;
}

describe('useFeature e IfFeature', () => {
  it('muestra la acción cuando la característica está en effective_features', () => {
    withFeatures(['DOCUMENT_UPLOAD', 'DOCUMENT_VIEW']);

    render(
      <IfFeature code="DOCUMENT_UPLOAD">
        <button type="button">Cargar documentos</button>
      </IfFeature>,
    );

    expect(screen.getByRole('button', { name: 'Cargar documentos' })).toBeInTheDocument();
  });

  it('oculta la acción cuando la característica no está habilitada', () => {
    withFeatures(['DOCUMENT_VIEW']);

    render(
      <IfFeature code="DOCUMENT_TRANSFER">
        <button type="button">Transferir</button>
      </IfFeature>,
    );

    expect(screen.queryByRole('button', { name: 'Transferir' })).not.toBeInTheDocument();
  });

  it('muestra el contenido alternativo en lugar de la acción oculta', () => {
    withFeatures([]);

    render(
      <IfFeature code="TRASH_PURGE" fallback={<p>Tu rol no puede purgar la papelera.</p>}>
        <button type="button">Purgar</button>
      </IfFeature>,
    );

    expect(screen.queryByRole('button', { name: 'Purgar' })).not.toBeInTheDocument();
    expect(screen.getByText('Tu rol no puede purgar la papelera.')).toBeInTheDocument();
  });

  it('no oculta nada si el servidor todavía no publica effective_features', () => {
    // Ocultar sin dato sería inventar una restricción: decide el servidor.
    withFeatures(null);

    render(
      <IfFeature code="LO_QUE_SEA">
        <button type="button">Acción</button>
      </IfFeature>,
    );

    expect(screen.getByRole('button', { name: 'Acción' })).toBeInTheDocument();
  });

  it('useFeature devuelve el valor booleano de la característica', () => {
    withFeatures(['AUDIT_VIEW']);

    const { rerender } = render(<Probe code="AUDIT_VIEW" />);
    expect(screen.getByTestId('probe')).toHaveTextContent('si');

    rerender(<Probe code="AUDIT_EXPORT" />);
    expect(screen.getByTestId('probe')).toHaveTextContent('no');
  });

  it('useFeatures exige todas con «every» y basta una con «some»', () => {
    withFeatures(['INVOICE_MANAGE']);

    const { rerender } = render(<MultiProbe codes={['INVOICE_MANAGE', 'PAYMENT_MANAGE']} mode="every" />);
    expect(screen.getByTestId('multi')).toHaveTextContent('no');

    rerender(<MultiProbe codes={['INVOICE_MANAGE', 'PAYMENT_MANAGE']} mode="some" />);
    expect(screen.getByTestId('multi')).toHaveTextContent('si');
  });
});
