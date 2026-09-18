import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { evaluatePassword } from '@/lib/password';
import { PasswordStrength } from './PasswordStrength';
import type { PasswordPolicy } from '@/types/api';

/** Política tal como la publica `GET /system/password-policy`. */
const POLICY: PasswordPolicy = {
  min_length: 10,
  require_upper: true,
  require_lower: true,
  require_digit: true,
  require_symbol: false,
  max_attempts: 5,
  lockout_minutes: 15,
  expiry_days: 90,
  history_count: 5,
  temporary_ttl_hours: 48,
};

describe('PasswordStrength · mide contra la política del servidor', () => {
  it('declara solo las reglas que exige la política, ni una más', () => {
    render(<PasswordStrength password="" policy={POLICY} />);

    expect(screen.getByText('Al menos 10 caracteres')).toBeInTheDocument();
    expect(screen.getByText('Una letra mayúscula')).toBeInTheDocument();
    expect(screen.getByText('Una letra minúscula')).toBeInTheDocument();
    expect(screen.getByText('Un número')).toBeInTheDocument();
    // La política no exige símbolos: la interfaz no se los inventa.
    expect(screen.queryByText('Un símbolo')).not.toBeInTheDocument();
  });

  it('usa la longitud mínima real, no una constante del cliente', () => {
    render(<PasswordStrength password="" policy={{ ...POLICY, min_length: 16 }} />);
    expect(screen.getByText('Al menos 16 caracteres')).toBeInTheDocument();
  });

  it('marca la contraseña como débil mientras faltan reglas', () => {
    render(<PasswordStrength password="corta" policy={POLICY} />);
    expect(screen.getByTestId('password-strength-label')).toHaveTextContent('Débil');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
  });

  it('la da por fuerte cuando cumple todas las reglas con holgura', () => {
    render(<PasswordStrength password="ArchivoSeguro2026" policy={POLICY} />);
    expect(screen.getByTestId('password-strength-label')).toHaveTextContent('Fuerte');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('anuncia el historial y la caducidad que declara el servidor', () => {
    render(<PasswordStrength password="ArchivoSeguro2026" policy={POLICY} />);
    expect(
      screen.getByText(/rechaza además las últimas 5 contraseñas usadas y caduca cada 90 días/i),
    ).toBeInTheDocument();
  });

  it('no puntúa nada cuando no se pudo leer la política', () => {
    render(<PasswordStrength password="loquesea" policy={null} policyError="403 FORBIDDEN" />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText(/No se pudo leer la política de contraseñas/i)).toBeInTheDocument();
    expect(screen.getByText(/403 FORBIDDEN/)).toBeInTheDocument();
  });
});

describe('evaluatePassword', () => {
  it('no da por válida una contraseña a la que le falta una regla', () => {
    const result = evaluatePassword('sinmayusculas1', POLICY);
    expect(result.valid).toBe(false);
    expect(result.rules.find((rule) => rule.id === 'upper')?.met).toBe(false);
  });

  it('exige símbolo solo si la política lo pide', () => {
    const sinSimbolo = evaluatePassword('ArchivoSeguro1', POLICY);
    expect(sinSimbolo.valid).toBe(true);

    const conExigencia = evaluatePassword('ArchivoSeguro1', { ...POLICY, require_symbol: true });
    expect(conExigencia.valid).toBe(false);
  });
});
