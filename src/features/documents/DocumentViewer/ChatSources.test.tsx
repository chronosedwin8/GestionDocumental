import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clearQueryCache } from '@/hooks/useQuery';
import { ChatSources, locateQuote } from './ChatSources';

vi.mock('@/api/documents', () => ({
  getDocumentText: vi.fn(),
}));

import * as documentsApi from '@/api/documents';

const TEXT =
  'Acta número 12 del consejo directivo. El contratista se obliga a entregar el informe final antes del 30 de junio de 2026. Firmado por el rector.';

describe('ChatSources · citas del chat', () => {
  beforeEach(() => {
    clearQueryCache();
    vi.mocked(documentsApi.getDocumentText).mockReset();
  });

  it('localiza la cita por offset y devuelve su contexto', () => {
    const quote = 'entregar el informe final antes del 30 de junio de 2026';
    const context = locateQuote(TEXT, { quote, offset: TEXT.indexOf(quote) });

    expect(context.located).toBe(true);
    expect(context.quote).toBe(quote);
    expect(context.before).toContain('El contratista se obliga a');
  });

  it('busca la cita literalmente si el offset no cuadra', () => {
    const quote = 'Firmado por el rector.';
    const context = locateQuote(TEXT, { quote, offset: 9999 });

    expect(context.located).toBe(true);
    expect(context.after).toBe('');
  });

  it('no finge una localización cuando la cita no está en el texto', () => {
    const context = locateQuote(TEXT, { quote: 'una frase que no aparece', offset: 0 });
    expect(context.located).toBe(false);
  });

  it('muestra las citas y abre el fragmento resaltado al pulsarlas', async () => {
    const user = userEvent.setup();
    vi.mocked(documentsApi.getDocumentText).mockResolvedValue({ text: TEXT, truncated: false });

    const quote = 'entregar el informe final antes del 30 de junio de 2026';
    render(<ChatSources documentId="doc-1" sources={[{ quote, offset: TEXT.indexOf(quote) }]} />);

    expect(screen.getByText('Citas del documento (1)')).toBeInTheDocument();
    // El texto del documento no se pide hasta que se abre una cita.
    expect(documentsApi.getDocumentText).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: `«${quote}»` }));

    const mark = await screen.findByText(quote, { selector: 'mark' });
    expect(mark).toBeInTheDocument();
  });
});
