import styles from './AsistentReassignBanner.module.css';

interface AsistentReassignBannerProps {
  state: 'empty' | 'inactive';
}

export function AsistentReassignBanner({ state }: AsistentReassignBannerProps) {
  const isEmpty = state === 'empty';
  return (
    <section className={styles.banner} role="status">
      <h2>{isEmpty ? 'Asteapta asignarea.' : 'Asteapta o reasignare.'}</h2>
      <p>
        {isEmpty
          ? 'Esti invitat ca asistent, dar proprietarul clinicii nu te-a asignat inca unui medic.'
          : 'Niciunul dintre medicii carora le esti asistent nu are calendar activ. Proprietarul te va reasigna in curand.'}
      </p>
    </section>
  );
}
