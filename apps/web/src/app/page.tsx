import Image from "next/image";
import Link from "next/link";

import { HomePrimaryCta } from "./home-cta";
import { HomeHeader } from "./home-header";
import styles from "./home.module.css";

export default function Home() {
  return (
    <main className={styles.home}>
      <HomeHeader />

      <div className={styles.main}>
        <section aria-labelledby="home-hero-title" className={styles.hero}>
          <div className={styles.heroVisual}>
            <div className={styles.heroMark}>
              <Image
                alt="Moments Forever"
                className={styles.heroImage}
                height={1254}
                priority
                sizes="(max-width: 720px) min(300px, 78vw), (max-width: 1024px) 340px, 400px"
                src="/brand/logo.png"
                width={1254}
              />
            </div>
          </div>

          <div className={styles.heroCopy}>
            <p className={styles.brand}>Moments Forever</p>
            <h1 className={styles.title} id="home-hero-title">
              Suas histórias, sempre por perto.
            </h1>
            <p className={styles.lead}>
              Guarde suas viagens. Reviva seus momentos.
            </p>
            <HomePrimaryCta className={styles.ctaRow} />
            <p className={styles.heroAside}>Viagens · Lugares · Momentos</p>
          </div>
        </section>

        <section
          aria-labelledby="home-memories-title"
          className={styles.memories}
        >
          <p className={styles.memoriesEyebrow}>Memórias que ficam</p>
          <h2 className={styles.memoriesTitle} id="home-memories-title">
            A fotografia no centro.
          </h2>
          <div className={styles.memoryMosaic} aria-hidden="true">
            <figure className={`${styles.memoryCell} ${styles.memoryTall}`}>
              <Image
                alt=""
                className={styles.memoryImage}
                height={1254}
                sizes="(max-width: 720px) 50vw, 280px"
                src="/brand/logo.png"
                width={1254}
              />
            </figure>
            <figure className={`${styles.memoryCell} ${styles.memoryWide}`}>
              <Image
                alt=""
                className={styles.memoryImage}
                height={512}
                sizes="(max-width: 720px) 50vw, 320px"
                src="/brand/navlogo.png"
                width={768}
              />
            </figure>
            <figure className={`${styles.memoryCell} ${styles.memorySquare}`}>
              <Image
                alt=""
                className={styles.memoryImage}
                height={512}
                sizes="(max-width: 720px) 50vw, 200px"
                src="/brand/navlogo2.png"
                width={768}
              />
            </figure>
            <figure className={`${styles.memoryCell} ${styles.memorySquareAlt}`}>
              <Image
                alt=""
                className={styles.memoryImage}
                height={1254}
                sizes="(max-width: 720px) 50vw, 220px"
                src="/brand/logo.png"
                width={1254}
              />
            </figure>
            <figure className={`${styles.memoryCell} ${styles.memoryFeature}`}>
              <Image
                alt=""
                className={styles.memoryImage}
                height={1254}
                sizes="(max-width: 720px) 100vw, 420px"
                src="/brand/logo.png"
                width={1254}
              />
            </figure>
          </div>
        </section>

        <section
          aria-labelledby="home-concepts-title"
          className={styles.section}
        >
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle} id="home-concepts-title">
              Uma coleção, em camadas simples.
            </h2>
            <p className={styles.sectionLead}>
              Organize memórias do jeito que elas acontecem — sem simular
              viagens ou fotos que ainda não existem.
            </p>
          </div>
          <ol className={styles.conceptList}>
            <li className={styles.conceptItem}>
              <span className={styles.conceptIndex} aria-hidden="true">
                01
              </span>
              <div className={styles.conceptCopy}>
                <h3>Viagem</h3>
                <p>Cada viagem vira uma coleção própria, fácil de encontrar.</p>
              </div>
            </li>
            <li className={styles.conceptItem}>
              <span className={styles.conceptIndex} aria-hidden="true">
                02
              </span>
              <div className={styles.conceptCopy}>
                <h3>Lugares</h3>
                <p>
                  Dentro da viagem, os lugares guardam o contexto de cada
                  momento.
                </p>
              </div>
            </li>
            <li className={styles.conceptItem}>
              <span className={styles.conceptIndex} aria-hidden="true">
                03
              </span>
              <div className={styles.conceptCopy}>
                <h3>Fotos</h3>
                <p>Reviva suas fotos em uma experiência limpa e fotográfica.</p>
              </div>
            </li>
          </ol>
        </section>

        <section aria-labelledby="home-finale-title" className={styles.finale}>
          <div className={styles.finaleInner}>
            <h2 id="home-finale-title">Comece a guardar suas viagens.</h2>
            <p>Crie sua coleção e organize o que importa.</p>
            <HomePrimaryCta className={styles.ctaRow} />
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <p className={styles.footerBrand}>Moments Forever</p>
        <nav aria-label="Rodapé" className={styles.footerNav}>
          <Link className={styles.footerLink} href="/privacidade">
            Privacidade
          </Link>
          <Link className={styles.footerLink} href="/login">
            Entrar
          </Link>
        </nav>
      </footer>
    </main>
  );
}
