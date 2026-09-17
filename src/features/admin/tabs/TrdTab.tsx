import TrdPage from '@/features/trd/TrdPage';

/** La pestaña de TRD reutiliza la página completa: una sola implementación. */
export function TrdTab(): React.JSX.Element {
  return <TrdPage embedded />;
}
