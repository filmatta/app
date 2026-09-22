import Image from "next/image";
import styles from "./FilmattaLoader.module.css";

export default function FilmattaLoader() {
  return (
    <main className={styles.screen} aria-busy="true">
      <span className={styles.srOnly} role="status">
        Cargando FILMATTA…
      </span>
      <Image
        className={styles.logo}
        src="/brand/filmatta-logo-loader.png"
        alt=""
        aria-hidden="true"
        width={444}
        height={504}
        loading="eager"
      />
    </main>
  );
}
